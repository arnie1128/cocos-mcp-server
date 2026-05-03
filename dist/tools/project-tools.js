"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const project_docs_1 = require("../data/project-docs");
class ProjectTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async runProject(platform = 'browser') {
        var _a;
        if (platform && typeof platform === 'object') {
            platform = (_a = platform.platform) !== null && _a !== void 0 ? _a : 'browser';
        }
        return new Promise((resolve) => {
            const previewConfig = {
                platform: platform,
                scenes: [] // Will use current scene
            };
            // Note: Preview module is not documented in official API
            // Using fallback approach - open build panel as alternative
            Editor.Message.request('builder', 'open').then(() => {
                resolve((0, response_1.ok)(undefined, `Build panel opened. Preview functionality requires manual setup.`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async buildProject(args) {
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
                resolve((0, response_1.ok)({
                    platform: args.platform,
                    instruction: "Use the build panel to configure and start the build process"
                }, `Build panel opened for ${args.platform}. Please configure and start build manually.`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getProjectInfo() {
        return new Promise((resolve) => {
            var _a;
            const info = {
                name: Editor.Project.name,
                path: Editor.Project.path,
                uuid: Editor.Project.uuid,
                version: Editor.Project.version || '1.0.0',
                cocosVersion: ((_a = Editor.versions) === null || _a === void 0 ? void 0 : _a.cocos) || 'Unknown'
            };
            // Note: 'query-info' API doesn't exist, using 'query-config' instead
            Editor.Message.request('project', 'query-config', 'project').then((additionalInfo) => {
                if (additionalInfo) {
                    Object.assign(info, { config: additionalInfo });
                }
                resolve((0, response_1.ok)(info));
            }).catch(() => {
                // Return basic info even if detailed query fails
                resolve((0, response_1.ok)(info));
            });
        });
    }
    async getProjectSettings(category = 'general') {
        var _a;
        if (category && typeof category === 'object') {
            category = (_a = category.category) !== null && _a !== void 0 ? _a : 'general';
        }
        return new Promise((resolve) => {
            // 使用正確的 project API 查詢項目配置
            const configMap = {
                general: 'project',
                physics: 'physics',
                render: 'render',
                assets: 'asset-db'
            };
            const configName = configMap[category] || 'project';
            Editor.Message.request('project', 'query-config', configName).then((settings) => {
                resolve((0, response_1.ok)({
                    category: category,
                    config: settings,
                    message: `${category} settings retrieved successfully`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async refreshAssets(folder) {
        if (folder && typeof folder === 'object') {
            folder = folder.folder;
        }
        return new Promise((resolve) => {
            // 使用正確的 asset-db API 刷新資源
            const targetPath = folder || 'db://assets';
            Editor.Message.request('asset-db', 'refresh-asset', targetPath).then(() => {
                resolve((0, response_1.ok)(undefined, `Assets refreshed in: ${targetPath}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async importAsset(sourcePath, targetFolder) {
        if (sourcePath && typeof sourcePath === 'object') {
            targetFolder = sourcePath.targetFolder;
            sourcePath = sourcePath.sourcePath;
        }
        return new Promise((resolve) => {
            if (!fs.existsSync(sourcePath)) {
                resolve((0, response_1.fail)('Source file not found'));
                return;
            }
            const fileName = path.basename(sourcePath);
            const targetPath = targetFolder.startsWith('db://') ?
                targetFolder : `db://assets/${targetFolder}`;
            Editor.Message.request('asset-db', 'import-asset', sourcePath, `${targetPath}/${fileName}`).then((result) => {
                resolve((0, response_1.ok)({
                    uuid: result.uuid,
                    path: result.url,
                    message: `Asset imported: ${fileName}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getAssetInfo(assetPath) {
        if (assetPath && typeof assetPath === 'object') {
            assetPath = assetPath.assetPath;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', assetPath).then((assetInfo) => {
                if (!assetInfo) {
                    throw new Error('Asset not found');
                }
                const info = {
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
                resolve((0, response_1.ok)(info));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getAssets(type = 'all', folder = 'db://assets') {
        var _a, _b;
        if (type && typeof type === 'object') {
            folder = (_a = type.folder) !== null && _a !== void 0 ? _a : 'db://assets';
            type = (_b = type.type) !== null && _b !== void 0 ? _b : 'all';
        }
        return new Promise((resolve) => {
            let pattern = `${folder}/**/*`;
            // 添加類型過濾
            if (type !== 'all') {
                const typeExtensions = {
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
            Editor.Message.request('asset-db', 'query-assets', { pattern: pattern }).then((results) => {
                const assets = results.map(asset => ({
                    name: asset.name,
                    uuid: asset.uuid,
                    path: asset.url,
                    type: asset.type,
                    size: asset.size || 0,
                    isDirectory: asset.isDirectory || false
                }));
                resolve((0, response_1.ok)({
                    type: type,
                    folder: folder,
                    count: assets.length,
                    assets: assets
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getBuildSettings() {
        return new Promise((resolve) => {
            // 檢查構建器是否準備就緒
            Editor.Message.request('builder', 'query-worker-ready').then((ready) => {
                resolve((0, response_1.ok)({
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
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async openBuildPanel() {
        return new Promise((resolve) => {
            Editor.Message.request('builder', 'open').then(() => {
                resolve((0, response_1.ok)(undefined, 'Build panel opened successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async checkBuilderStatus() {
        return new Promise((resolve) => {
            Editor.Message.request('builder', 'query-worker-ready').then((ready) => {
                resolve((0, response_1.ok)({
                    ready: ready,
                    status: ready ? 'Builder worker is ready' : 'Builder worker is not ready',
                    message: 'Builder status checked successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async startPreviewServer(port = 7456) {
        var _a;
        if (port && typeof port === 'object') {
            port = (_a = port.port) !== null && _a !== void 0 ? _a : 7456;
        }
        return new Promise((resolve) => {
            resolve({
                success: false,
                error: 'Preview server control is not supported through MCP API',
                instruction: 'Please start the preview server manually using the editor menu: Project > Preview, or use the preview panel in the editor'
            });
        });
    }
    async stopPreviewServer() {
        return new Promise((resolve) => {
            resolve({
                success: false,
                error: 'Preview server control is not supported through MCP API',
                instruction: 'Please stop the preview server manually using the preview panel in the editor'
            });
        });
    }
    async createAsset(url, content = null, overwrite = false) {
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
            Editor.Message.request('asset-db', 'create-asset', url, content, options).then((result) => {
                if (result && result.uuid) {
                    resolve((0, response_1.ok)({
                        uuid: result.uuid,
                        url: result.url,
                        message: content === null ? 'Folder created successfully' : 'File created successfully'
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        url: url,
                        message: content === null ? 'Folder created successfully' : 'File created successfully'
                    }));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async copyAsset(source, target, overwrite = false) {
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
            Editor.Message.request('asset-db', 'copy-asset', source, target, options).then((result) => {
                if (result && result.uuid) {
                    resolve((0, response_1.ok)({
                        uuid: result.uuid,
                        url: result.url,
                        message: 'Asset copied successfully'
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        source: source,
                        target: target,
                        message: 'Asset copied successfully'
                    }));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async moveAsset(source, target, overwrite = false) {
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
            Editor.Message.request('asset-db', 'move-asset', source, target, options).then((result) => {
                if (result && result.uuid) {
                    resolve((0, response_1.ok)({
                        uuid: result.uuid,
                        url: result.url,
                        message: 'Asset moved successfully'
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        source: source,
                        target: target,
                        message: 'Asset moved successfully'
                    }));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async deleteAsset(url) {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'delete-asset', url).then((result) => {
                resolve((0, response_1.ok)({
                    url: url,
                    message: 'Asset deleted successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async saveAsset(url, content) {
        if (url && typeof url === 'object') {
            content = url.content;
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'save-asset', url, content).then((result) => {
                if (result && result.uuid) {
                    resolve((0, response_1.ok)({
                        uuid: result.uuid,
                        url: result.url,
                        message: 'Asset saved successfully'
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        url: url,
                        message: 'Asset saved successfully'
                    }));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async reimportAsset(url) {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'reimport-asset', url).then(() => {
                resolve((0, response_1.ok)({
                    url: url,
                    message: 'Asset reimported successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryAssetPath(url) {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-path', url).then((path) => {
                if (path) {
                    resolve((0, response_1.ok)({
                        url: url,
                        path: path,
                        message: 'Asset path retrieved successfully'
                    }));
                }
                else {
                    resolve((0, response_1.fail)('Asset path not found'));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryAssetUuid(url) {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-uuid', url).then((uuid) => {
                if (uuid) {
                    resolve((0, response_1.ok)({
                        url: url,
                        uuid: uuid,
                        message: 'Asset UUID retrieved successfully'
                    }));
                }
                else {
                    resolve((0, response_1.fail)('Asset UUID not found'));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryAssetUrl(uuid) {
        if (uuid && typeof uuid === 'object') {
            uuid = uuid.uuid;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-url', uuid).then((url) => {
                if (url) {
                    resolve((0, response_1.ok)({
                        uuid: uuid,
                        url: url,
                        message: 'Asset URL retrieved successfully'
                    }));
                }
                else {
                    resolve((0, response_1.fail)('Asset URL not found'));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async findAssetByName(args) {
        const { name, exactMatch = false, assetType = 'all', folder = 'db://assets', maxResults = 20 } = args;
        try {
            // Get all assets in the specified folder
            const allAssetsResponse = await this.getAssets(assetType, folder);
            if (!allAssetsResponse.success || !allAssetsResponse.data) {
                return (0, response_1.fail)(`Failed to get assets: ${allAssetsResponse.error}`);
            }
            const allAssets = allAssetsResponse.data.assets;
            let matchedAssets = [];
            // Search for matching assets
            for (const asset of allAssets) {
                const assetName = asset.name;
                let matches = false;
                if (exactMatch) {
                    matches = assetName === name;
                }
                else {
                    matches = assetName.toLowerCase().includes(name.toLowerCase());
                }
                if (matches) {
                    // Get detailed asset info if needed
                    try {
                        const detailResponse = await this.getAssetInfo(asset.path);
                        if (detailResponse.success) {
                            matchedAssets.push(Object.assign(Object.assign({}, asset), { details: detailResponse.data }));
                        }
                        else {
                            matchedAssets.push(asset);
                        }
                    }
                    catch (_a) {
                        matchedAssets.push(asset);
                    }
                    if (matchedAssets.length >= maxResults) {
                        break;
                    }
                }
            }
            return (0, response_1.ok)({
                searchTerm: name,
                exactMatch,
                assetType,
                folder,
                totalFound: matchedAssets.length,
                maxResults,
                assets: matchedAssets,
                message: `Found ${matchedAssets.length} assets matching '${name}'`
            });
        }
        catch (error) {
            return (0, response_1.fail)(`Asset search failed: ${error.message}`);
        }
    }
    async getAssetDetails(assetPath, includeSubAssets = true) {
        if (assetPath && typeof assetPath === 'object') {
            includeSubAssets = assetPath.includeSubAssets;
            assetPath = assetPath.assetPath;
        }
        try {
            // Get basic asset info
            const assetInfoResponse = await this.getAssetInfo(assetPath);
            if (!assetInfoResponse.success) {
                return assetInfoResponse;
            }
            const assetInfo = assetInfoResponse.data;
            const detailedInfo = Object.assign(Object.assign({}, assetInfo), { subAssets: [] });
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
                        }
                        catch (_a) {
                            // Sub-asset doesn't exist, skip it
                        }
                    }
                }
            }
            return (0, response_1.ok)(Object.assign(Object.assign({ assetPath,
                includeSubAssets }, detailedInfo), { message: `Asset details retrieved. Found ${detailedInfo.subAssets.length} sub-assets.` }));
        }
        catch (error) {
            return (0, response_1.fail)(`Failed to get asset details: ${error.message}`);
        }
    }
}
exports.ProjectTools = ProjectTools;
__decorate([
    (0, decorators_1.mcpTool)({ name: 'run_project', title: 'Open preview fallback', description: project_docs_1.PROJECT_DOCS.run_project,
        inputSchema: schema_1.z.object({
            platform: schema_1.z.enum(['browser', 'simulator', 'preview']).default('browser').describe('Requested preview platform. Current implementation opens the build panel instead of launching preview.'),
        })
    })
], ProjectTools.prototype, "runProject", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'build_project', title: 'Open build fallback', description: project_docs_1.PROJECT_DOCS.build_project,
        inputSchema: schema_1.z.object({
            platform: schema_1.z.enum(['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac']).describe('Build platform to pre-contextualize the response. Actual build still requires Editor UI.'),
            debug: schema_1.z.boolean().default(true).describe('Requested debug build flag. Returned as context only; build is not started programmatically.'),
        })
    })
], ProjectTools.prototype, "buildProject", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_project_info', title: 'Read project info', description: project_docs_1.PROJECT_DOCS.get_project_info,
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "getProjectInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_project_settings', title: 'Read project settings', description: project_docs_1.PROJECT_DOCS.get_project_settings,
        inputSchema: schema_1.z.object({
            category: schema_1.z.enum(['general', 'physics', 'render', 'assets']).default('general').describe('Project settings category to query via project/query-config.'),
        })
    })
], ProjectTools.prototype, "getProjectSettings", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'refresh_assets', title: 'Refresh asset folder', description: project_docs_1.PROJECT_DOCS.refresh_assets,
        inputSchema: schema_1.z.object({
            folder: schema_1.z.string().optional().describe('Asset db:// folder to refresh. Omit to refresh db://assets.'),
        })
    })
], ProjectTools.prototype, "refreshAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'import_asset', title: 'Import asset file', description: project_docs_1.PROJECT_DOCS.import_asset,
        inputSchema: schema_1.z.object({
            sourcePath: schema_1.z.string().describe('Absolute source file path on disk. Must exist.'),
            targetFolder: schema_1.z.string().describe('Target asset folder, either db://... or relative under db://assets.'),
        })
    })
], ProjectTools.prototype, "importAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_asset_info', title: 'Read asset info', description: project_docs_1.PROJECT_DOCS.get_asset_info,
        inputSchema: schema_1.z.object({
            assetPath: schema_1.z.string().describe('Asset db:// path to query.'),
        })
    })
], ProjectTools.prototype, "getAssetInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_assets', title: 'List project assets', description: project_docs_1.PROJECT_DOCS.get_assets,
        inputSchema: schema_1.z.object({
            type: schema_1.z.enum(['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation']).default('all').describe('Asset type filter translated into filename patterns.'),
            folder: schema_1.z.string().default('db://assets').describe('Asset-db folder to search. Default db://assets.'),
        })
    })
], ProjectTools.prototype, "getAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_build_settings', title: 'Read build settings', description: project_docs_1.PROJECT_DOCS.get_build_settings,
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "getBuildSettings", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'open_build_panel', title: 'Open build panel', description: project_docs_1.PROJECT_DOCS.open_build_panel,
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "openBuildPanel", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'check_builder_status', title: 'Check builder status', description: project_docs_1.PROJECT_DOCS.check_builder_status,
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "checkBuilderStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'start_preview_server', title: 'Start preview server', description: project_docs_1.PROJECT_DOCS.start_preview_server,
        inputSchema: schema_1.z.object({
            port: schema_1.z.number().default(7456).describe('Requested preview server port. Current implementation reports unsupported.'),
        })
    })
], ProjectTools.prototype, "startPreviewServer", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'stop_preview_server', title: 'Stop preview server', description: project_docs_1.PROJECT_DOCS.stop_preview_server,
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "stopPreviewServer", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'create_asset', title: 'Create asset', description: project_docs_1.PROJECT_DOCS.create_asset,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Target asset db:// URL, e.g. db://assets/newfile.json.'),
            content: schema_1.z.string().nullable().optional().describe('File content. Pass null/omit for folder creation.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "createAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'copy_asset', title: 'Copy asset', description: project_docs_1.PROJECT_DOCS.copy_asset,
        inputSchema: schema_1.z.object({
            source: schema_1.z.string().describe('Source asset db:// URL.'),
            target: schema_1.z.string().describe('Target asset db:// URL or folder path.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "copyAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'move_asset', title: 'Move asset', description: project_docs_1.PROJECT_DOCS.move_asset,
        inputSchema: schema_1.z.object({
            source: schema_1.z.string().describe('Source asset db:// URL.'),
            target: schema_1.z.string().describe('Target asset db:// URL or folder path.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "moveAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'delete_asset', title: 'Delete asset', description: project_docs_1.PROJECT_DOCS.delete_asset,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to delete.'),
        })
    })
], ProjectTools.prototype, "deleteAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'save_asset', title: 'Save asset', description: project_docs_1.PROJECT_DOCS.save_asset,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL whose content should be saved.'),
            content: schema_1.z.string().describe('Serialized asset content to write.'),
        })
    })
], ProjectTools.prototype, "saveAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reimport_asset', title: 'Reimport asset', description: project_docs_1.PROJECT_DOCS.reimport_asset,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to reimport.'),
        })
    })
], ProjectTools.prototype, "reimportAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_path', title: 'Resolve asset path', description: project_docs_1.PROJECT_DOCS.query_asset_path,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to resolve to a disk path.'),
        })
    })
], ProjectTools.prototype, "queryAssetPath", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_uuid', title: 'Resolve asset UUID', description: project_docs_1.PROJECT_DOCS.query_asset_uuid,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to resolve to UUID.'),
        })
    })
], ProjectTools.prototype, "queryAssetUuid", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_url', title: 'Resolve asset URL', description: project_docs_1.PROJECT_DOCS.query_asset_url,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Asset UUID to resolve to db:// URL.'),
        })
    })
], ProjectTools.prototype, "queryAssetUrl", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'find_asset_by_name', title: 'Find asset by name', description: project_docs_1.PROJECT_DOCS.find_asset_by_name,
        inputSchema: schema_1.z.object({
            name: schema_1.z.string().describe('Asset name search term. Partial match unless exactMatch=true.'),
            exactMatch: schema_1.z.boolean().default(false).describe('Require exact asset name match. Default false.'),
            assetType: schema_1.z.enum(['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation', 'spriteFrame']).default('all').describe('Asset type filter for the search.'),
            folder: schema_1.z.string().default('db://assets').describe('Asset-db folder to search. Default db://assets.'),
            maxResults: schema_1.z.number().min(1).max(100).default(20).describe('Maximum matched assets to return. Default 20.'),
        })
    })
], ProjectTools.prototype, "findAssetByName", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_asset_details', title: 'Read asset details', description: project_docs_1.PROJECT_DOCS.get_asset_details,
        inputSchema: schema_1.z.object({
            assetPath: schema_1.z.string().describe('Asset db:// path to inspect.'),
            includeSubAssets: schema_1.z.boolean().default(true).describe('Try to include known image sub-assets such as spriteFrame and texture UUIDs.'),
        })
    })
], ProjectTools.prototype, "getAssetDetails", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvamVjdC10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9wcm9qZWN0LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsdURBQW9EO0FBRXBELE1BQWEsWUFBWTtJQUdyQjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBT25HLEFBQU4sS0FBSyxDQUFDLFVBQVUsQ0FBQyxXQUFnQixTQUFTOztRQUN0QyxJQUFJLFFBQVEsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUMzQyxRQUFRLEdBQUcsTUFBQSxRQUFRLENBQUMsUUFBUSxtQ0FBSSxTQUFTLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLGFBQWEsR0FBRztnQkFDbEIsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLE1BQU0sRUFBRSxFQUFFLENBQUMseUJBQXlCO2FBQ3ZDLENBQUM7WUFFRix5REFBeUQ7WUFDekQsNERBQTREO1lBQzVELE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FB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TyxFQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsMkJBQVksQ0FBQyxpQkFBaUI7UUFDbEcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsOEJBQThCLENBQUM7WUFDOUQsZ0JBQWdCLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsOEVBQThFLENBQUM7U0FDdkksQ0FBQztLQUNiLENBQUM7bURBMkREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFByb2plY3RJbmZvLCBBc3NldEluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFBST0pFQ1RfRE9DUyB9IGZyb20gJy4uL2RhdGEvcHJvamVjdC1kb2NzJztcblxuZXhwb3J0IGNsYXNzIFByb2plY3RUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdydW5fcHJvamVjdCcsIHRpdGxlOiAnT3BlbiBwcmV2aWV3IGZhbGxiYWNrJywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5ydW5fcHJvamVjdCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogei5lbnVtKFsnYnJvd3NlcicsICdzaW11bGF0b3InLCAncHJldmlldyddKS5kZWZhdWx0KCdicm93c2VyJykuZGVzY3JpYmUoJ1JlcXVlc3RlZCBwcmV2aWV3IHBsYXRmb3JtLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIG9wZW5zIHRoZSBidWlsZCBwYW5lbCBpbnN0ZWFkIG9mIGxhdW5jaGluZyBwcmV2aWV3LicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBydW5Qcm9qZWN0KHBsYXRmb3JtOiBhbnkgPSAnYnJvd3NlcicpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAocGxhdGZvcm0gJiYgdHlwZW9mIHBsYXRmb3JtID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgcGxhdGZvcm0gPSBwbGF0Zm9ybS5wbGF0Zm9ybSA/PyAnYnJvd3Nlcic7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3Q29uZmlnID0ge1xuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBwbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBzY2VuZXM6IFtdIC8vIFdpbGwgdXNlIGN1cnJlbnQgc2NlbmVcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIE5vdGU6IFByZXZpZXcgbW9kdWxlIGlzIG5vdCBkb2N1bWVudGVkIGluIG9mZmljaWFsIEFQSVxuICAgICAgICAgICAgLy8gVXNpbmcgZmFsbGJhY2sgYXBwcm9hY2ggLSBvcGVuIGJ1aWxkIHBhbmVsIGFzIGFsdGVybmF0aXZlXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ29wZW4nKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEJ1aWxkIHBhbmVsIG9wZW5lZC4gUHJldmlldyBmdW5jdGlvbmFsaXR5IHJlcXVpcmVzIG1hbnVhbCBzZXR1cC5gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2J1aWxkX3Byb2plY3QnLCB0aXRsZTogJ09wZW4gYnVpbGQgZmFsbGJhY2snLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmJ1aWxkX3Byb2plY3QsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGxhdGZvcm06IHouZW51bShbJ3dlYi1tb2JpbGUnLCAnd2ViLWRlc2t0b3AnLCAnaW9zJywgJ2FuZHJvaWQnLCAnd2luZG93cycsICdtYWMnXSkuZGVzY3JpYmUoJ0J1aWxkIHBsYXRmb3JtIHRvIHByZS1jb250ZXh0dWFsaXplIHRoZSByZXNwb25zZS4gQWN0dWFsIGJ1aWxkIHN0aWxsIHJlcXVpcmVzIEVkaXRvciBVSS4nKSxcbiAgICAgICAgICAgICAgICAgICAgZGVidWc6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ1JlcXVlc3RlZCBkZWJ1ZyBidWlsZCBmbGFnLiBSZXR1cm5lZCBhcyBjb250ZXh0IG9ubHk7IGJ1aWxkIGlzIG5vdCBzdGFydGVkIHByb2dyYW1tYXRpY2FsbHkuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGJ1aWxkUHJvamVjdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkT3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogYXJncy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBkZWJ1ZzogYXJncy5kZWJ1ZyAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgc291cmNlTWFwczogYXJncy5kZWJ1ZyAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgYnVpbGRQYXRoOiBgYnVpbGQvJHthcmdzLnBsYXRmb3JtfWBcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIE5vdGU6IEJ1aWxkZXIgbW9kdWxlIG9ubHkgc3VwcG9ydHMgJ29wZW4nIGFuZCAncXVlcnktd29ya2VyLXJlYWR5J1xuICAgICAgICAgICAgLy8gQnVpbGRpbmcgcmVxdWlyZXMgbWFudWFsIGludGVyYWN0aW9uIHRocm91Z2ggdGhlIGJ1aWxkIHBhbmVsXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ29wZW4nKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogYXJncy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBcIlVzZSB0aGUgYnVpbGQgcGFuZWwgdG8gY29uZmlndXJlIGFuZCBzdGFydCB0aGUgYnVpbGQgcHJvY2Vzc1wiXG4gICAgICAgICAgICAgICAgICAgIH0sIGBCdWlsZCBwYW5lbCBvcGVuZWQgZm9yICR7YXJncy5wbGF0Zm9ybX0uIFBsZWFzZSBjb25maWd1cmUgYW5kIHN0YXJ0IGJ1aWxkIG1hbnVhbGx5LmApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZ2V0X3Byb2plY3RfaW5mbycsIHRpdGxlOiAnUmVhZCBwcm9qZWN0IGluZm8nLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmdldF9wcm9qZWN0X2luZm8sXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KVxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UHJvamVjdEluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpbmZvOiBQcm9qZWN0SW5mbyA9IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBFZGl0b3IuUHJvamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IEVkaXRvci5Qcm9qZWN0LnBhdGgsXG4gICAgICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZCxcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiAoRWRpdG9yLlByb2plY3QgYXMgYW55KS52ZXJzaW9uIHx8ICcxLjAuMCcsXG4gICAgICAgICAgICAgICAgY29jb3NWZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gTm90ZTogJ3F1ZXJ5LWluZm8nIEFQSSBkb2Vzbid0IGV4aXN0LCB1c2luZyAncXVlcnktY29uZmlnJyBpbnN0ZWFkXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcm9qZWN0JywgJ3F1ZXJ5LWNvbmZpZycsICdwcm9qZWN0JykudGhlbigoYWRkaXRpb25hbEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChhZGRpdGlvbmFsSW5mbykge1xuICAgICAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGluZm8sIHsgY29uZmlnOiBhZGRpdGlvbmFsSW5mbyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhpbmZvKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gUmV0dXJuIGJhc2ljIGluZm8gZXZlbiBpZiBkZXRhaWxlZCBxdWVyeSBmYWlsc1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soaW5mbykpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9wcm9qZWN0X3NldHRpbmdzJywgdGl0bGU6ICdSZWFkIHByb2plY3Qgc2V0dGluZ3MnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmdldF9wcm9qZWN0X3NldHRpbmdzLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiB6LmVudW0oWydnZW5lcmFsJywgJ3BoeXNpY3MnLCAncmVuZGVyJywgJ2Fzc2V0cyddKS5kZWZhdWx0KCdnZW5lcmFsJykuZGVzY3JpYmUoJ1Byb2plY3Qgc2V0dGluZ3MgY2F0ZWdvcnkgdG8gcXVlcnkgdmlhIHByb2plY3QvcXVlcnktY29uZmlnLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcm9qZWN0U2V0dGluZ3MoY2F0ZWdvcnk6IGFueSA9ICdnZW5lcmFsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChjYXRlZ29yeSAmJiB0eXBlb2YgY2F0ZWdvcnkgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBjYXRlZ29yeSA9IGNhdGVnb3J5LmNhdGVnb3J5ID8/ICdnZW5lcmFsJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBwcm9qZWN0IEFQSSDmn6XoqaLpoIXnm67phY3nva5cbiAgICAgICAgICAgIGNvbnN0IGNvbmZpZ01hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgICAgICAgICBnZW5lcmFsOiAncHJvamVjdCcsXG4gICAgICAgICAgICAgICAgcGh5c2ljczogJ3BoeXNpY3MnLFxuICAgICAgICAgICAgICAgIHJlbmRlcjogJ3JlbmRlcicsXG4gICAgICAgICAgICAgICAgYXNzZXRzOiAnYXNzZXQtZGInXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBjb25maWdOYW1lID0gY29uZmlnTWFwW2NhdGVnb3J5XSB8fCAncHJvamVjdCc7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgY29uZmlnTmFtZSkudGhlbigoc2V0dGluZ3M6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uZmlnOiBzZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGAke2NhdGVnb3J5fSBzZXR0aW5ncyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3JlZnJlc2hfYXNzZXRzJywgdGl0bGU6ICdSZWZyZXNoIGFzc2V0IGZvbGRlcicsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MucmVmcmVzaF9hc3NldHMsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIGZvbGRlciB0byByZWZyZXNoLiBPbWl0IHRvIHJlZnJlc2ggZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHJlZnJlc2hBc3NldHMoZm9sZGVyPzogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGZvbGRlciAmJiB0eXBlb2YgZm9sZGVyID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9sZGVyID0gZm9sZGVyLmZvbGRlcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBhc3NldC1kYiBBUEkg5Yi35paw6LOH5rqQXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gZm9sZGVyIHx8ICdkYjovL2Fzc2V0cyc7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCB0YXJnZXRQYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEFzc2V0cyByZWZyZXNoZWQgaW46ICR7dGFyZ2V0UGF0aH1gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2ltcG9ydF9hc3NldCcsIHRpdGxlOiAnSW1wb3J0IGFzc2V0IGZpbGUnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmltcG9ydF9hc3NldCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2VQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBzb3VyY2UgZmlsZSBwYXRoIG9uIGRpc2suIE11c3QgZXhpc3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEZvbGRlcjogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0IGZvbGRlciwgZWl0aGVyIGRiOi8vLi4uIG9yIHJlbGF0aXZlIHVuZGVyIGRiOi8vYXNzZXRzLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBpbXBvcnRBc3NldChzb3VyY2VQYXRoOiBhbnksIHRhcmdldEZvbGRlcj86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChzb3VyY2VQYXRoICYmIHR5cGVvZiBzb3VyY2VQYXRoID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyID0gc291cmNlUGF0aC50YXJnZXRGb2xkZXI7XG4gICAgICAgICAgICBzb3VyY2VQYXRoID0gc291cmNlUGF0aC5zb3VyY2VQYXRoO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHNvdXJjZVBhdGgpKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdTb3VyY2UgZmlsZSBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IHBhdGguYmFzZW5hbWUoc291cmNlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gdGFyZ2V0Rm9sZGVyIS5zdGFydHNXaXRoKCdkYjovLycpID9cbiAgICAgICAgICAgICAgICB0YXJnZXRGb2xkZXIhIDogYGRiOi8vYXNzZXRzLyR7dGFyZ2V0Rm9sZGVyfWA7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2ltcG9ydC1hc3NldCcsIHNvdXJjZVBhdGgsIGAke3RhcmdldFBhdGh9LyR7ZmlsZU5hbWV9YCkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBc3NldCBpbXBvcnRlZDogJHtmaWxlTmFtZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZ2V0X2Fzc2V0X2luZm8nLCB0aXRsZTogJ1JlYWQgYXNzZXQgaW5mbycsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MuZ2V0X2Fzc2V0X2luZm8sXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBwYXRoIHRvIHF1ZXJ5LicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBnZXRBc3NldEluZm8oYXNzZXRQYXRoOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoYXNzZXRQYXRoICYmIHR5cGVvZiBhc3NldFBhdGggPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBhc3NldFBhdGggPSBhc3NldFBhdGguYXNzZXRQYXRoO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0UGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Fzc2V0IG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IEFzc2V0SW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldEluZm8udXJsLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogYXNzZXRJbmZvLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGlzRGlyZWN0b3J5OiBhc3NldEluZm8uaXNEaXJlY3RvcnlcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mby5tZXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZm8ubWV0YSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlcjogYXNzZXRJbmZvLm1ldGEudmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0ZXI6IGFzc2V0SW5mby5tZXRhLmltcG9ydGVyXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhpbmZvKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9hc3NldHMnLCB0aXRsZTogJ0xpc3QgcHJvamVjdCBhc3NldHMnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmdldF9hc3NldHMsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5lbnVtKFsnYWxsJywgJ3NjZW5lJywgJ3ByZWZhYicsICdzY3JpcHQnLCAndGV4dHVyZScsICdtYXRlcmlhbCcsICdtZXNoJywgJ2F1ZGlvJywgJ2FuaW1hdGlvbiddKS5kZWZhdWx0KCdhbGwnKS5kZXNjcmliZSgnQXNzZXQgdHlwZSBmaWx0ZXIgdHJhbnNsYXRlZCBpbnRvIGZpbGVuYW1lIHBhdHRlcm5zLicpLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZm9sZGVyIHRvIHNlYXJjaC4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QXNzZXRzKHR5cGU6IGFueSA9ICdhbGwnLCBmb2xkZXI6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAodHlwZSAmJiB0eXBlb2YgdHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGZvbGRlciA9IHR5cGUuZm9sZGVyID8/ICdkYjovL2Fzc2V0cyc7XG4gICAgICAgICAgICB0eXBlID0gdHlwZS50eXBlID8/ICdhbGwnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgbGV0IHBhdHRlcm4gPSBgJHtmb2xkZXJ9LyoqLypgO1xuXG4gICAgICAgICAgICAvLyDmt7vliqDpoZ7lnovpgY7mv75cbiAgICAgICAgICAgIGlmICh0eXBlICE9PSAnYWxsJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVFeHRlbnNpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICAgICAgICAgICAnc2NlbmUnOiAnLnNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgJ3ByZWZhYic6ICcucHJlZmFiJyxcbiAgICAgICAgICAgICAgICAgICAgJ3NjcmlwdCc6ICcue3RzLGpzfScsXG4gICAgICAgICAgICAgICAgICAgICd0ZXh0dXJlJzogJy57cG5nLGpwZyxqcGVnLGdpZix0Z2EsYm1wLHBzZH0nLFxuICAgICAgICAgICAgICAgICAgICAnbWF0ZXJpYWwnOiAnLm10bCcsXG4gICAgICAgICAgICAgICAgICAgICdtZXNoJzogJy57ZmJ4LG9iaixkYWV9JyxcbiAgICAgICAgICAgICAgICAgICAgJ2F1ZGlvJzogJy57bXAzLG9nZyx3YXYsbTRhfScsXG4gICAgICAgICAgICAgICAgICAgICdhbmltYXRpb24nOiAnLnthbmltLGNsaXB9J1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBjb25zdCBleHRlbnNpb24gPSB0eXBlRXh0ZW5zaW9uc1t0eXBlXTtcbiAgICAgICAgICAgICAgICBpZiAoZXh0ZW5zaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm4gPSBgJHtmb2xkZXJ9LyoqLyoke2V4dGVuc2lvbn1gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm90ZTogcXVlcnktYXNzZXRzIEFQSSBwYXJhbWV0ZXJzIGNvcnJlY3RlZCBiYXNlZCBvbiBkb2N1bWVudGF0aW9uXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IHBhdHRlcm4gfSkudGhlbigocmVzdWx0czogYW55W10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldHMgPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IGFzc2V0LnNpemUgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgaXNEaXJlY3Rvcnk6IGFzc2V0LmlzRGlyZWN0b3J5IHx8IGZhbHNlXG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBmb2xkZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogYXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0czogYXNzZXRzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZ2V0X2J1aWxkX3NldHRpbmdzJywgdGl0bGU6ICdSZWFkIGJ1aWxkIHNldHRpbmdzJywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5nZXRfYnVpbGRfc2V0dGluZ3MsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KVxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QnVpbGRTZXR0aW5ncygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOaqouafpeani+W7uuWZqOaYr+WQpua6luWCmeWwsee3klxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdxdWVyeS13b3JrZXItcmVhZHknKS50aGVuKChyZWFkeTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgYnVpbGRlclJlYWR5OiByZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCdWlsZCBzZXR0aW5ncyBhcmUgbGltaXRlZCBpbiBNQ1AgcGx1Z2luIGVudmlyb25tZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZUFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnT3BlbiBidWlsZCBwYW5lbCB3aXRoIG9wZW5fYnVpbGRfcGFuZWwnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGVjayBidWlsZGVyIHN0YXR1cyB3aXRoIGNoZWNrX2J1aWxkZXJfc3RhdHVzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnU3RhcnQgcHJldmlldyBzZXJ2ZXIgd2l0aCBzdGFydF9wcmV2aWV3X3NlcnZlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1N0b3AgcHJldmlldyBzZXJ2ZXIgd2l0aCBzdG9wX3ByZXZpZXdfc2VydmVyJ1xuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbWl0YXRpb246ICdGdWxsIGJ1aWxkIGNvbmZpZ3VyYXRpb24gcmVxdWlyZXMgZGlyZWN0IEVkaXRvciBVSSBhY2Nlc3MnXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnb3Blbl9idWlsZF9wYW5lbCcsIHRpdGxlOiAnT3BlbiBidWlsZCBwYW5lbCcsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1Mub3Blbl9idWlsZF9wYW5lbCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBvcGVuQnVpbGRQYW5lbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2J1aWxkZXInLCAnb3BlbicpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnQnVpbGQgcGFuZWwgb3BlbmVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hlY2tfYnVpbGRlcl9zdGF0dXMnLCB0aXRsZTogJ0NoZWNrIGJ1aWxkZXIgc3RhdHVzJywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5jaGVja19idWlsZGVyX3N0YXR1cyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBjaGVja0J1aWxkZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ3F1ZXJ5LXdvcmtlci1yZWFkeScpLnRoZW4oKHJlYWR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWFkeTogcmVhZHksXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXM6IHJlYWR5ID8gJ0J1aWxkZXIgd29ya2VyIGlzIHJlYWR5JyA6ICdCdWlsZGVyIHdvcmtlciBpcyBub3QgcmVhZHknLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0J1aWxkZXIgc3RhdHVzIGNoZWNrZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3N0YXJ0X3ByZXZpZXdfc2VydmVyJywgdGl0bGU6ICdTdGFydCBwcmV2aWV3IHNlcnZlcicsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1Muc3RhcnRfcHJldmlld19zZXJ2ZXIsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydDogei5udW1iZXIoKS5kZWZhdWx0KDc0NTYpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgcHJldmlldyBzZXJ2ZXIgcG9ydC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBzdGFydFByZXZpZXdTZXJ2ZXIocG9ydDogYW55ID0gNzQ1Nik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChwb3J0ICYmIHR5cGVvZiBwb3J0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgcG9ydCA9IHBvcnQucG9ydCA/PyA3NDU2O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdQcmV2aWV3IHNlcnZlciBjb250cm9sIGlzIG5vdCBzdXBwb3J0ZWQgdGhyb3VnaCBNQ1AgQVBJJyxcbiAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ1BsZWFzZSBzdGFydCB0aGUgcHJldmlldyBzZXJ2ZXIgbWFudWFsbHkgdXNpbmcgdGhlIGVkaXRvciBtZW51OiBQcm9qZWN0ID4gUHJldmlldywgb3IgdXNlIHRoZSBwcmV2aWV3IHBhbmVsIGluIHRoZSBlZGl0b3InXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnc3RvcF9wcmV2aWV3X3NlcnZlcicsIHRpdGxlOiAnU3RvcCBwcmV2aWV3IHNlcnZlcicsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1Muc3RvcF9wcmV2aWV3X3NlcnZlcixcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBzdG9wUHJldmlld1NlcnZlcigpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiAnUHJldmlldyBzZXJ2ZXIgY29udHJvbCBpcyBub3Qgc3VwcG9ydGVkIHRocm91Z2ggTUNQIEFQSScsXG4gICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICdQbGVhc2Ugc3RvcCB0aGUgcHJldmlldyBzZXJ2ZXIgbWFudWFsbHkgdXNpbmcgdGhlIHByZXZpZXcgcGFuZWwgaW4gdGhlIGVkaXRvcidcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjcmVhdGVfYXNzZXQnLCB0aXRsZTogJ0NyZWF0ZSBhc3NldCcsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MuY3JlYXRlX2Fzc2V0LFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0IGRiOi8vIFVSTCwgZS5nLiBkYjovL2Fzc2V0cy9uZXdmaWxlLmpzb24uJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHouc3RyaW5nKCkubnVsbGFibGUoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGaWxlIGNvbnRlbnQuIFBhc3MgbnVsbC9vbWl0IGZvciBmb2xkZXIgY3JlYXRpb24uJyksXG4gICAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ092ZXJ3cml0ZSBleGlzdGluZyB0YXJnZXQgaW5zdGVhZCBvZiBhdXRvLXJlbmFtaW5nLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVBc3NldCh1cmw6IGFueSwgY29udGVudDogc3RyaW5nIHwgbnVsbCA9IG51bGwsIG92ZXJ3cml0ZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHVybCAmJiB0eXBlb2YgdXJsID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY29udGVudCA9IHVybC5jb250ZW50O1xuICAgICAgICAgICAgb3ZlcndyaXRlID0gdXJsLm92ZXJ3cml0ZTtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogb3ZlcndyaXRlLFxuICAgICAgICAgICAgICAgIHJlbmFtZTogIW92ZXJ3cml0ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnY3JlYXRlLWFzc2V0JywgdXJsLCBjb250ZW50LCBvcHRpb25zKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRlbnQgPT09IG51bGwgPyAnRm9sZGVyIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5JyA6ICdGaWxlIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRlbnQgPT09IG51bGwgPyAnRm9sZGVyIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5JyA6ICdGaWxlIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY29weV9hc3NldCcsIHRpdGxlOiAnQ29weSBhc3NldCcsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MuY29weV9hc3NldCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBhc3NldCBkYjovLyBVUkwuJyksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0IGRiOi8vIFVSTCBvciBmb2xkZXIgcGF0aC4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIGV4aXN0aW5nIHRhcmdldCBpbnN0ZWFkIG9mIGF1dG8tcmVuYW1pbmcuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGNvcHlBc3NldChzb3VyY2U6IGFueSwgdGFyZ2V0Pzogc3RyaW5nLCBvdmVyd3JpdGU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChzb3VyY2UgJiYgdHlwZW9mIHNvdXJjZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRhcmdldCA9IHNvdXJjZS50YXJnZXQ7XG4gICAgICAgICAgICBvdmVyd3JpdGUgPSBzb3VyY2Uub3ZlcndyaXRlO1xuICAgICAgICAgICAgc291cmNlID0gc291cmNlLnNvdXJjZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3ZlcndyaXRlOiBvdmVyd3JpdGUsXG4gICAgICAgICAgICAgICAgcmVuYW1lOiAhb3ZlcndyaXRlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdjb3B5LWFzc2V0Jywgc291cmNlLCB0YXJnZXQhLCBvcHRpb25zKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBjb3BpZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBjb3BpZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnbW92ZV9hc3NldCcsIHRpdGxlOiAnTW92ZSBhc3NldCcsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MubW92ZV9hc3NldCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBhc3NldCBkYjovLyBVUkwuJyksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0IGRiOi8vIFVSTCBvciBmb2xkZXIgcGF0aC4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIGV4aXN0aW5nIHRhcmdldCBpbnN0ZWFkIG9mIGF1dG8tcmVuYW1pbmcuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIG1vdmVBc3NldChzb3VyY2U6IGFueSwgdGFyZ2V0Pzogc3RyaW5nLCBvdmVyd3JpdGU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChzb3VyY2UgJiYgdHlwZW9mIHNvdXJjZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRhcmdldCA9IHNvdXJjZS50YXJnZXQ7XG4gICAgICAgICAgICBvdmVyd3JpdGUgPSBzb3VyY2Uub3ZlcndyaXRlO1xuICAgICAgICAgICAgc291cmNlID0gc291cmNlLnNvdXJjZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3ZlcndyaXRlOiBvdmVyd3JpdGUsXG4gICAgICAgICAgICAgICAgcmVuYW1lOiAhb3ZlcndyaXRlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdtb3ZlLWFzc2V0Jywgc291cmNlLCB0YXJnZXQhLCBvcHRpb25zKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBtb3ZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBzb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Fzc2V0IG1vdmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2RlbGV0ZV9hc3NldCcsIHRpdGxlOiAnRGVsZXRlIGFzc2V0JywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5kZWxldGVfYXNzZXQsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgdG8gZGVsZXRlLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBkZWxldGVBc3NldCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1cmwpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBkZWxldGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzYXZlX2Fzc2V0JywgdGl0bGU6ICdTYXZlIGFzc2V0JywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5zYXZlX2Fzc2V0LFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMIHdob3NlIGNvbnRlbnQgc2hvdWxkIGJlIHNhdmVkLicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50OiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZXJpYWxpemVkIGFzc2V0IGNvbnRlbnQgdG8gd3JpdGUuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHNhdmVBc3NldCh1cmw6IGFueSwgY29udGVudD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSB1cmwuY29udGVudDtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0JywgdXJsLCBjb250ZW50ISkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgc2F2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBzYXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZWltcG9ydF9hc3NldCcsIHRpdGxlOiAnUmVpbXBvcnQgYXNzZXQnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLnJlaW1wb3J0X2Fzc2V0LFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMIHRvIHJlaW1wb3J0LicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyByZWltcG9ydEFzc2V0KHVybDogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHVybCAmJiB0eXBlb2YgdXJsID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdXJsID0gdXJsLnVybDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlaW1wb3J0LWFzc2V0JywgdXJsKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Fzc2V0IHJlaW1wb3J0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X2Fzc2V0X3BhdGgnLCB0aXRsZTogJ1Jlc29sdmUgYXNzZXQgcGF0aCcsIGRlc2NyaXB0aW9uOiBQUk9KRUNUX0RPQ1MucXVlcnlfYXNzZXRfcGF0aCxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCB0byByZXNvbHZlIHRvIGEgZGlzayBwYXRoLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeUFzc2V0UGF0aCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1wYXRoJywgdXJsKS50aGVuKChwYXRoOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgcGF0aCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgcGF0aCBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9hc3NldF91dWlkJywgdGl0bGU6ICdSZXNvbHZlIGFzc2V0IFVVSUQnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLnF1ZXJ5X2Fzc2V0X3V1aWQsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgdG8gcmVzb2x2ZSB0byBVVUlELicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeUFzc2V0VXVpZCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgdXJsKS50aGVuKCh1dWlkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgVVVJRCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgVVVJRCBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9hc3NldF91cmwnLCB0aXRsZTogJ1Jlc29sdmUgYXNzZXQgVVJMJywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5xdWVyeV9hc3NldF91cmwsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgVVVJRCB0byByZXNvbHZlIHRvIGRiOi8vIFVSTC4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgcXVlcnlBc3NldFVybCh1dWlkOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAodXVpZCAmJiB0eXBlb2YgdXVpZCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHV1aWQgPSB1dWlkLnV1aWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCB1dWlkKS50aGVuKCh1cmw6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodXJsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Fzc2V0IFVSTCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgVVJMIG5vdCBmb3VuZCcpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2ZpbmRfYXNzZXRfYnlfbmFtZScsIHRpdGxlOiAnRmluZCBhc3NldCBieSBuYW1lJywgZGVzY3JpcHRpb246IFBST0pFQ1RfRE9DUy5maW5kX2Fzc2V0X2J5X25hbWUsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgbmFtZSBzZWFyY2ggdGVybS4gUGFydGlhbCBtYXRjaCB1bmxlc3MgZXhhY3RNYXRjaD10cnVlLicpLFxuICAgICAgICAgICAgICAgICAgICBleGFjdE1hdGNoOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZSBleGFjdCBhc3NldCBuYW1lIG1hdGNoLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGU6IHouZW51bShbJ2FsbCcsICdzY2VuZScsICdwcmVmYWInLCAnc2NyaXB0JywgJ3RleHR1cmUnLCAnbWF0ZXJpYWwnLCAnbWVzaCcsICdhdWRpbycsICdhbmltYXRpb24nLCAnc3ByaXRlRnJhbWUnXSkuZGVmYXVsdCgnYWxsJykuZGVzY3JpYmUoJ0Fzc2V0IHR5cGUgZmlsdGVyIGZvciB0aGUgc2VhcmNoLicpLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZm9sZGVyIHRvIHNlYXJjaC4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlZCBhc3NldHMgdG8gcmV0dXJuLiBEZWZhdWx0IDIwLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBmaW5kQXNzZXRCeU5hbWUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyBuYW1lLCBleGFjdE1hdGNoID0gZmFsc2UsIGFzc2V0VHlwZSA9ICdhbGwnLCBmb2xkZXIgPSAnZGI6Ly9hc3NldHMnLCBtYXhSZXN1bHRzID0gMjAgfSA9IGFyZ3M7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gR2V0IGFsbCBhc3NldHMgaW4gdGhlIHNwZWNpZmllZCBmb2xkZXJcbiAgICAgICAgICAgIGNvbnN0IGFsbEFzc2V0c1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5nZXRBc3NldHMoYXNzZXRUeXBlLCBmb2xkZXIpO1xuICAgICAgICAgICAgaWYgKCFhbGxBc3NldHNSZXNwb25zZS5zdWNjZXNzIHx8ICFhbGxBc3NldHNSZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBnZXQgYXNzZXRzOiAke2FsbEFzc2V0c1Jlc3BvbnNlLmVycm9yfWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBhbGxBc3NldHMgPSBhbGxBc3NldHNSZXNwb25zZS5kYXRhLmFzc2V0cyBhcyBhbnlbXTtcbiAgICAgICAgICAgIGxldCBtYXRjaGVkQXNzZXRzOiBhbnlbXSA9IFtdO1xuXG4gICAgICAgICAgICAvLyBTZWFyY2ggZm9yIG1hdGNoaW5nIGFzc2V0c1xuICAgICAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhbGxBc3NldHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldE5hbWUgPSBhc3NldC5uYW1lO1xuICAgICAgICAgICAgICAgIGxldCBtYXRjaGVzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGV4YWN0TWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcyA9IGFzc2V0TmFtZSA9PT0gbmFtZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzID0gYXNzZXROYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IGRldGFpbGVkIGFzc2V0IGluZm8gaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxSZXNwb25zZSA9IGF3YWl0IHRoaXMuZ2V0QXNzZXRJbmZvKGFzc2V0LnBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRldGFpbFJlc3BvbnNlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkQXNzZXRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuLi5hc3NldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsczogZGV0YWlsUmVzcG9uc2UuZGF0YVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkQXNzZXRzLnB1c2goYXNzZXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZWRBc3NldHMucHVzaChhc3NldCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZEFzc2V0cy5sZW5ndGggPj0gbWF4UmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHNlYXJjaFRlcm06IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0TWF0Y2gsXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbEZvdW5kOiBtYXRjaGVkQXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRzOiBtYXRjaGVkQXNzZXRzLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHttYXRjaGVkQXNzZXRzLmxlbmd0aH0gYXNzZXRzIG1hdGNoaW5nICcke25hbWV9J2BcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgQXNzZXQgc2VhcmNoIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9hc3NldF9kZXRhaWxzJywgdGl0bGU6ICdSZWFkIGFzc2V0IGRldGFpbHMnLCBkZXNjcmlwdGlvbjogUFJPSkVDVF9ET0NTLmdldF9hc3NldF9kZXRhaWxzLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gcGF0aCB0byBpbnNwZWN0LicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlU3ViQXNzZXRzOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdUcnkgdG8gaW5jbHVkZSBrbm93biBpbWFnZSBzdWItYXNzZXRzIHN1Y2ggYXMgc3ByaXRlRnJhbWUgYW5kIHRleHR1cmUgVVVJRHMuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGdldEFzc2V0RGV0YWlscyhhc3NldFBhdGg6IGFueSwgaW5jbHVkZVN1YkFzc2V0czogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoYXNzZXRQYXRoICYmIHR5cGVvZiBhc3NldFBhdGggPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpbmNsdWRlU3ViQXNzZXRzID0gYXNzZXRQYXRoLmluY2x1ZGVTdWJBc3NldHM7XG4gICAgICAgICAgICBhc3NldFBhdGggPSBhc3NldFBhdGguYXNzZXRQYXRoO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBHZXQgYmFzaWMgYXNzZXQgaW5mb1xuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldEFzc2V0SW5mbyhhc3NldFBhdGgpO1xuICAgICAgICAgICAgaWYgKCFhc3NldEluZm9SZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFzc2V0SW5mb1Jlc3BvbnNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhc3NldEluZm9SZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgY29uc3QgZGV0YWlsZWRJbmZvOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgLi4uYXNzZXRJbmZvLFxuICAgICAgICAgICAgICAgIHN1YkFzc2V0czogW11cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChpbmNsdWRlU3ViQXNzZXRzICYmIGFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIC8vIEZvciBpbWFnZSBhc3NldHMsIHRyeSB0byBnZXQgc3ByaXRlRnJhbWUgYW5kIHRleHR1cmUgc3ViLWFzc2V0c1xuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8udHlwZSA9PT0gJ2NjLkltYWdlQXNzZXQnIHx8IGFzc2V0UGF0aC5tYXRjaCgvXFwuKHBuZ3xqcGd8anBlZ3xnaWZ8dGdhfGJtcHxwc2QpJC9pKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBHZW5lcmF0ZSBjb21tb24gc3ViLWFzc2V0IFVVSURzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VVdWlkID0gYXNzZXRJbmZvLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBvc3NpYmxlU3ViQXNzZXRzID0gW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyB0eXBlOiAnc3ByaXRlRnJhbWUnLCB1dWlkOiBgJHtiYXNlVXVpZH1AZjk5NDFgLCBzdWZmaXg6ICdAZjk5NDEnIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHR5cGU6ICd0ZXh0dXJlJywgdXVpZDogYCR7YmFzZVV1aWR9QDZjNDhhYCwgc3VmZml4OiAnQDZjNDhhJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyB0eXBlOiAndGV4dHVyZTJEJywgdXVpZDogYCR7YmFzZVV1aWR9QDZjNDhhYCwgc3VmZml4OiAnQDZjNDhhJyB9XG4gICAgICAgICAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBzdWJBc3NldCBvZiBwb3NzaWJsZVN1YkFzc2V0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUcnkgdG8gZ2V0IFVSTCBmb3IgdGhlIHN1Yi1hc3NldCB0byB2ZXJpZnkgaXQgZXhpc3RzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViQXNzZXRVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzdWJBc3NldC51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3ViQXNzZXRVcmwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsZWRJbmZvLnN1YkFzc2V0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHN1YkFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBzdWJBc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBzdWJBc3NldFVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1ZmZpeDogc3ViQXNzZXQuc3VmZml4XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN1Yi1hc3NldCBkb2Vzbid0IGV4aXN0LCBza2lwIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZVN1YkFzc2V0cyxcbiAgICAgICAgICAgICAgICAgICAgLi4uZGV0YWlsZWRJbmZvLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgZGV0YWlscyByZXRyaWV2ZWQuIEZvdW5kICR7ZGV0YWlsZWRJbmZvLnN1YkFzc2V0cy5sZW5ndGh9IHN1Yi1hc3NldHMuYFxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gZ2V0IGFzc2V0IGRldGFpbHM6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==