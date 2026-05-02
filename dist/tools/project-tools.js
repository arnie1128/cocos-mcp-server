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
        return new Promise(async (resolve) => {
            try {
                // Get all assets in the specified folder
                const allAssetsResponse = await this.getAssets(assetType, folder);
                if (!allAssetsResponse.success || !allAssetsResponse.data) {
                    resolve((0, response_1.fail)(`Failed to get assets: ${allAssetsResponse.error}`));
                    return;
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
                resolve((0, response_1.ok)({
                    searchTerm: name,
                    exactMatch,
                    assetType,
                    folder,
                    totalFound: matchedAssets.length,
                    maxResults,
                    assets: matchedAssets,
                    message: `Found ${matchedAssets.length} assets matching '${name}'`
                }));
            }
            catch (error) {
                resolve((0, response_1.fail)(`Asset search failed: ${error.message}`));
            }
        });
    }
    async getAssetDetails(assetPath, includeSubAssets = true) {
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
                resolve((0, response_1.ok)(Object.assign(Object.assign({ assetPath,
                    includeSubAssets }, detailedInfo), { message: `Asset details retrieved. Found ${detailedInfo.subAssets.length} sub-assets.` })));
            }
            catch (error) {
                resolve((0, response_1.fail)(`Failed to get asset details: ${error.message}`));
            }
        });
    }
}
exports.ProjectTools = ProjectTools;
__decorate([
    (0, decorators_1.mcpTool)({ name: 'run_project', title: 'Open preview fallback', description: '[specialist] Open Build panel as preview fallback; does not launch preview automatically.',
        inputSchema: schema_1.z.object({
            platform: schema_1.z.enum(['browser', 'simulator', 'preview']).default('browser').describe('Requested preview platform. Current implementation opens the build panel instead of launching preview.'),
        })
    })
], ProjectTools.prototype, "runProject", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'build_project', title: 'Open build fallback', description: '[specialist] Open Build panel for the requested platform; does not start the build.',
        inputSchema: schema_1.z.object({
            platform: schema_1.z.enum(['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac']).describe('Build platform to pre-contextualize the response. Actual build still requires Editor UI.'),
            debug: schema_1.z.boolean().default(true).describe('Requested debug build flag. Returned as context only; build is not started programmatically.'),
        })
    })
], ProjectTools.prototype, "buildProject", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_project_info', title: 'Read project info', description: '[specialist] Read project name/path/uuid/version/Cocos version and config. Also exposed as resource cocos://project/info; prefer the resource when the client supports MCP resources.',
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "getProjectInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_project_settings', title: 'Read project settings', description: '[specialist] Read one project settings category via project/query-config.',
        inputSchema: schema_1.z.object({
            category: schema_1.z.enum(['general', 'physics', 'render', 'assets']).default('general').describe('Project settings category to query via project/query-config.'),
        })
    })
], ProjectTools.prototype, "getProjectSettings", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'refresh_assets', title: 'Refresh asset folder', description: '[specialist] Refresh asset-db for a folder; affects Editor asset state, not file content.',
        inputSchema: schema_1.z.object({
            folder: schema_1.z.string().optional().describe('Asset db:// folder to refresh. Omit to refresh db://assets.'),
        })
    })
], ProjectTools.prototype, "refreshAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'import_asset', title: 'Import asset file', description: '[specialist] Import one disk file into asset-db; mutates project assets.',
        inputSchema: schema_1.z.object({
            sourcePath: schema_1.z.string().describe('Absolute source file path on disk. Must exist.'),
            targetFolder: schema_1.z.string().describe('Target asset folder, either db://... or relative under db://assets.'),
        })
    })
], ProjectTools.prototype, "importAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_asset_info', title: 'Read asset info', description: '[specialist] Read basic metadata for one db:// asset path.',
        inputSchema: schema_1.z.object({
            assetPath: schema_1.z.string().describe('Asset db:// path to query.'),
        })
    })
], ProjectTools.prototype, "getAssetInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_assets', title: 'List project assets', description: '[specialist] List assets under a folder using type-specific filename patterns. Also exposed as resource cocos://assets (defaults type=all, folder=db://assets) and cocos://assets{?type,folder} template.',
        inputSchema: schema_1.z.object({
            type: schema_1.z.enum(['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation']).default('all').describe('Asset type filter translated into filename patterns.'),
            folder: schema_1.z.string().default('db://assets').describe('Asset-db folder to search. Default db://assets.'),
        })
    })
], ProjectTools.prototype, "getAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_build_settings', title: 'Read build settings', description: '[specialist] Report builder readiness and MCP build limitations.',
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "getBuildSettings", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'open_build_panel', title: 'Open build panel', description: '[specialist] Open the Cocos Build panel; does not start a build.',
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "openBuildPanel", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'check_builder_status', title: 'Check builder status', description: '[specialist] Check whether the builder worker is ready.',
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "checkBuilderStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'start_preview_server', title: 'Start preview server', description: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
        inputSchema: schema_1.z.object({
            port: schema_1.z.number().default(7456).describe('Requested preview server port. Current implementation reports unsupported.'),
        })
    })
], ProjectTools.prototype, "startPreviewServer", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'stop_preview_server', title: 'Stop preview server', description: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
        inputSchema: schema_1.z.object({})
    })
], ProjectTools.prototype, "stopPreviewServer", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'create_asset', title: 'Create asset', description: '[specialist] Create an asset file or folder through asset-db; null content creates folder.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Target asset db:// URL, e.g. db://assets/newfile.json.'),
            content: schema_1.z.string().nullable().optional().describe('File content. Pass null/omit for folder creation.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "createAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'copy_asset', title: 'Copy asset', description: '[specialist] Copy an asset through asset-db; mutates project assets.',
        inputSchema: schema_1.z.object({
            source: schema_1.z.string().describe('Source asset db:// URL.'),
            target: schema_1.z.string().describe('Target asset db:// URL or folder path.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "copyAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'move_asset', title: 'Move asset', description: '[specialist] Move or rename an asset through asset-db; mutates project assets.',
        inputSchema: schema_1.z.object({
            source: schema_1.z.string().describe('Source asset db:// URL.'),
            target: schema_1.z.string().describe('Target asset db:// URL or folder path.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
        })
    })
], ProjectTools.prototype, "moveAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'delete_asset', title: 'Delete asset', description: '[specialist] Delete one asset-db URL; mutates project assets.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to delete.'),
        })
    })
], ProjectTools.prototype, "deleteAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'save_asset', title: 'Save asset', description: '[specialist] Write serialized content to an asset URL; use only for known-good formats.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL whose content should be saved.'),
            content: schema_1.z.string().describe('Serialized asset content to write.'),
        })
    })
], ProjectTools.prototype, "saveAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reimport_asset', title: 'Reimport asset', description: '[specialist] Ask asset-db to reimport an asset; updates imported asset state/cache.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to reimport.'),
        })
    })
], ProjectTools.prototype, "reimportAsset", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_path', title: 'Resolve asset path', description: '[specialist] Resolve an asset db:// URL to disk path.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to resolve to a disk path.'),
        })
    })
], ProjectTools.prototype, "queryAssetPath", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_uuid', title: 'Resolve asset UUID', description: '[specialist] Resolve an asset db:// URL to UUID.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Asset db:// URL to resolve to UUID.'),
        })
    })
], ProjectTools.prototype, "queryAssetUuid", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_asset_url', title: 'Resolve asset URL', description: '[specialist] Resolve an asset UUID to db:// URL.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Asset UUID to resolve to db:// URL.'),
        })
    })
], ProjectTools.prototype, "queryAssetUrl", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'find_asset_by_name', title: 'Find asset by name', description: '[specialist] Search assets by name with exact/type/folder filters; use to discover UUIDs/paths.',
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
    (0, decorators_1.mcpTool)({ name: 'get_asset_details', title: 'Read asset details', description: '[specialist] Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs.',
        inputSchema: schema_1.z.object({
            assetPath: schema_1.z.string().describe('Asset db:// path to inspect.'),
            includeSubAssets: schema_1.z.boolean().default(true).describe('Try to include known image sub-assets such as spriteFrame and texture UUIDs.'),
        })
    })
], ProjectTools.prototype, "getAssetDetails", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvamVjdC10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9wcm9qZWN0LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0IsTUFBYSxZQUFZO0lBR3JCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFPbkcsQUFBTixLQUFLLENBQUMsVUFBVSxDQUFDLFdBQWdCLFNBQVM7O1FBQ3RDLElBQUksUUFBUSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzNDLFFBQVEsR0FBRyxNQUFBLFFBQVEsQ0FBQyxRQUFRLG1DQUFJLFNBQVMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sYUFBYSxHQUFHO2dCQUNsQixRQUFRLEVBQUUsUUFBUTtnQkFDbEIsTUFBTSxFQUFFLEVBQUUsQ0FBQyx5QkFBeUI7YUFDdkMsQ0FBQztZQUVGLHlEQUF5RDtZQUN6RCw0REFBNEQ7WUFDNUQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hE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QSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsNkZBQTZGO1FBQ2pLLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDhCQUE4QixDQUFDO1lBQzlELGdCQUFnQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLDhFQUE4RSxDQUFDO1NBQ3ZJLENBQUM7S0FDYixDQUFDO21EQThERCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcm9qZWN0SW5mbywgQXNzZXRJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBQcm9qZWN0VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncnVuX3Byb2plY3QnLCB0aXRsZTogJ09wZW4gcHJldmlldyBmYWxsYmFjaycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIE9wZW4gQnVpbGQgcGFuZWwgYXMgcHJldmlldyBmYWxsYmFjazsgZG9lcyBub3QgbGF1bmNoIHByZXZpZXcgYXV0b21hdGljYWxseS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBsYXRmb3JtOiB6LmVudW0oWydicm93c2VyJywgJ3NpbXVsYXRvcicsICdwcmV2aWV3J10pLmRlZmF1bHQoJ2Jyb3dzZXInKS5kZXNjcmliZSgnUmVxdWVzdGVkIHByZXZpZXcgcGxhdGZvcm0uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gb3BlbnMgdGhlIGJ1aWxkIHBhbmVsIGluc3RlYWQgb2YgbGF1bmNoaW5nIHByZXZpZXcuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHJ1blByb2plY3QocGxhdGZvcm06IGFueSA9ICdicm93c2VyJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChwbGF0Zm9ybSAmJiB0eXBlb2YgcGxhdGZvcm0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9IHBsYXRmb3JtLnBsYXRmb3JtID8/ICdicm93c2VyJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpZXdDb25maWcgPSB7XG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IHBsYXRmb3JtLFxuICAgICAgICAgICAgICAgIHNjZW5lczogW10gLy8gV2lsbCB1c2UgY3VycmVudCBzY2VuZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gTm90ZTogUHJldmlldyBtb2R1bGUgaXMgbm90IGRvY3VtZW50ZWQgaW4gb2ZmaWNpYWwgQVBJXG4gICAgICAgICAgICAvLyBVc2luZyBmYWxsYmFjayBhcHByb2FjaCAtIG9wZW4gYnVpbGQgcGFuZWwgYXMgYWx0ZXJuYXRpdmVcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2J1aWxkZXInLCAnb3BlbicpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgQnVpbGQgcGFuZWwgb3BlbmVkLiBQcmV2aWV3IGZ1bmN0aW9uYWxpdHkgcmVxdWlyZXMgbWFudWFsIHNldHVwLmApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnYnVpbGRfcHJvamVjdCcsIHRpdGxlOiAnT3BlbiBidWlsZCBmYWxsYmFjaycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIE9wZW4gQnVpbGQgcGFuZWwgZm9yIHRoZSByZXF1ZXN0ZWQgcGxhdGZvcm07IGRvZXMgbm90IHN0YXJ0IHRoZSBidWlsZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBsYXRmb3JtOiB6LmVudW0oWyd3ZWItbW9iaWxlJywgJ3dlYi1kZXNrdG9wJywgJ2lvcycsICdhbmRyb2lkJywgJ3dpbmRvd3MnLCAnbWFjJ10pLmRlc2NyaWJlKCdCdWlsZCBwbGF0Zm9ybSB0byBwcmUtY29udGV4dHVhbGl6ZSB0aGUgcmVzcG9uc2UuIEFjdHVhbCBidWlsZCBzdGlsbCByZXF1aXJlcyBFZGl0b3IgVUkuJyksXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgZGVidWcgYnVpbGQgZmxhZy4gUmV0dXJuZWQgYXMgY29udGV4dCBvbmx5OyBidWlsZCBpcyBub3Qgc3RhcnRlZCBwcm9ncmFtbWF0aWNhbGx5LicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBidWlsZFByb2plY3QoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBidWlsZE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IGFyZ3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgZGVidWc6IGFyZ3MuZGVidWcgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIHNvdXJjZU1hcHM6IGFyZ3MuZGVidWcgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIGJ1aWxkUGF0aDogYGJ1aWxkLyR7YXJncy5wbGF0Zm9ybX1gXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBOb3RlOiBCdWlsZGVyIG1vZHVsZSBvbmx5IHN1cHBvcnRzICdvcGVuJyBhbmQgJ3F1ZXJ5LXdvcmtlci1yZWFkeSdcbiAgICAgICAgICAgIC8vIEJ1aWxkaW5nIHJlcXVpcmVzIG1hbnVhbCBpbnRlcmFjdGlvbiB0aHJvdWdoIHRoZSBidWlsZCBwYW5lbFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdvcGVuJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7IFxuICAgICAgICAgICAgICAgICAgICAgICAgcGxhdGZvcm06IGFyZ3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogXCJVc2UgdGhlIGJ1aWxkIHBhbmVsIHRvIGNvbmZpZ3VyZSBhbmQgc3RhcnQgdGhlIGJ1aWxkIHByb2Nlc3NcIlxuICAgICAgICAgICAgICAgICAgICB9LCBgQnVpbGQgcGFuZWwgb3BlbmVkIGZvciAke2FyZ3MucGxhdGZvcm19LiBQbGVhc2UgY29uZmlndXJlIGFuZCBzdGFydCBidWlsZCBtYW51YWxseS5gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9wcm9qZWN0X2luZm8nLCB0aXRsZTogJ1JlYWQgcHJvamVjdCBpbmZvJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBwcm9qZWN0IG5hbWUvcGF0aC91dWlkL3ZlcnNpb24vQ29jb3MgdmVyc2lvbiBhbmQgY29uZmlnLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9wcm9qZWN0L2luZm87IHByZWZlciB0aGUgcmVzb3VyY2Ugd2hlbiB0aGUgY2xpZW50IHN1cHBvcnRzIE1DUCByZXNvdXJjZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcm9qZWN0SW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGluZm86IFByb2plY3RJbmZvID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IEVkaXRvci5Qcm9qZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgcGF0aDogRWRpdG9yLlByb2plY3QucGF0aCxcbiAgICAgICAgICAgICAgICB1dWlkOiBFZGl0b3IuUHJvamVjdC51dWlkLFxuICAgICAgICAgICAgICAgIHZlcnNpb246IChFZGl0b3IuUHJvamVjdCBhcyBhbnkpLnZlcnNpb24gfHwgJzEuMC4wJyxcbiAgICAgICAgICAgICAgICBjb2Nvc1ZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uY29jb3MgfHwgJ1Vua25vd24nXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBOb3RlOiAncXVlcnktaW5mbycgQVBJIGRvZXNuJ3QgZXhpc3QsIHVzaW5nICdxdWVyeS1jb25maWcnIGluc3RlYWRcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgJ3Byb2plY3QnKS50aGVuKChhZGRpdGlvbmFsSW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGFkZGl0aW9uYWxJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaW5mbywgeyBjb25maWc6IGFkZGl0aW9uYWxJbmZvIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGluZm8pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBSZXR1cm4gYmFzaWMgaW5mbyBldmVuIGlmIGRldGFpbGVkIHF1ZXJ5IGZhaWxzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhpbmZvKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZ2V0X3Byb2plY3Rfc2V0dGluZ3MnLCB0aXRsZTogJ1JlYWQgcHJvamVjdCBzZXR0aW5ncycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgb25lIHByb2plY3Qgc2V0dGluZ3MgY2F0ZWdvcnkgdmlhIHByb2plY3QvcXVlcnktY29uZmlnLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6IHouZW51bShbJ2dlbmVyYWwnLCAncGh5c2ljcycsICdyZW5kZXInLCAnYXNzZXRzJ10pLmRlZmF1bHQoJ2dlbmVyYWwnKS5kZXNjcmliZSgnUHJvamVjdCBzZXR0aW5ncyBjYXRlZ29yeSB0byBxdWVyeSB2aWEgcHJvamVjdC9xdWVyeS1jb25maWcuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb2plY3RTZXR0aW5ncyhjYXRlZ29yeTogYW55ID0gJ2dlbmVyYWwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGNhdGVnb3J5ICYmIHR5cGVvZiBjYXRlZ29yeSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNhdGVnb3J5ID0gY2F0ZWdvcnkuY2F0ZWdvcnkgPz8gJ2dlbmVyYWwnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5L2/55So5q2j56K655qEIHByb2plY3QgQVBJIOafpeipoumgheebrumFjee9rlxuICAgICAgICAgICAgY29uc3QgY29uZmlnTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICAgICAgIGdlbmVyYWw6ICdwcm9qZWN0JyxcbiAgICAgICAgICAgICAgICBwaHlzaWNzOiAncGh5c2ljcycsXG4gICAgICAgICAgICAgICAgcmVuZGVyOiAncmVuZGVyJyxcbiAgICAgICAgICAgICAgICBhc3NldHM6ICdhc3NldC1kYidcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbmZpZ05hbWUgPSBjb25maWdNYXBbY2F0ZWdvcnldIHx8ICdwcm9qZWN0JztcblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJvamVjdCcsICdxdWVyeS1jb25maWcnLCBjb25maWdOYW1lKS50aGVuKChzZXR0aW5nczogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25maWc6IHNldHRpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYCR7Y2F0ZWdvcnl9IHNldHRpbmdzIHJldHJpZXZlZCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncmVmcmVzaF9hc3NldHMnLCB0aXRsZTogJ1JlZnJlc2ggYXNzZXQgZm9sZGVyJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVmcmVzaCBhc3NldC1kYiBmb3IgYSBmb2xkZXI7IGFmZmVjdHMgRWRpdG9yIGFzc2V0IHN0YXRlLCBub3QgZmlsZSBjb250ZW50LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIGZvbGRlciB0byByZWZyZXNoLiBPbWl0IHRvIHJlZnJlc2ggZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHJlZnJlc2hBc3NldHMoZm9sZGVyPzogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGZvbGRlciAmJiB0eXBlb2YgZm9sZGVyID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9sZGVyID0gZm9sZGVyLmZvbGRlcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBhc3NldC1kYiBBUEkg5Yi35paw6LOH5rqQXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gZm9sZGVyIHx8ICdkYjovL2Fzc2V0cyc7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCB0YXJnZXRQYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEFzc2V0cyByZWZyZXNoZWQgaW46ICR7dGFyZ2V0UGF0aH1gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2ltcG9ydF9hc3NldCcsIHRpdGxlOiAnSW1wb3J0IGFzc2V0IGZpbGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBJbXBvcnQgb25lIGRpc2sgZmlsZSBpbnRvIGFzc2V0LWRiOyBtdXRhdGVzIHByb2plY3QgYXNzZXRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnQWJzb2x1dGUgc291cmNlIGZpbGUgcGF0aCBvbiBkaXNrLiBNdXN0IGV4aXN0LicpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRGb2xkZXI6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBhc3NldCBmb2xkZXIsIGVpdGhlciBkYjovLy4uLiBvciByZWxhdGl2ZSB1bmRlciBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgaW1wb3J0QXNzZXQoc291cmNlUGF0aDogYW55LCB0YXJnZXRGb2xkZXI/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoc291cmNlUGF0aCAmJiB0eXBlb2Ygc291cmNlUGF0aCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRhcmdldEZvbGRlciA9IHNvdXJjZVBhdGgudGFyZ2V0Rm9sZGVyO1xuICAgICAgICAgICAgc291cmNlUGF0aCA9IHNvdXJjZVBhdGguc291cmNlUGF0aDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhzb3VyY2VQYXRoKSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnU291cmNlIGZpbGUgbm90IGZvdW5kJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBwYXRoLmJhc2VuYW1lKHNvdXJjZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UGF0aCA9IHRhcmdldEZvbGRlciEuc3RhcnRzV2l0aCgnZGI6Ly8nKSA/XG4gICAgICAgICAgICAgICAgdGFyZ2V0Rm9sZGVyISA6IGBkYjovL2Fzc2V0cy8ke3RhcmdldEZvbGRlcn1gO1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdpbXBvcnQtYXNzZXQnLCBzb3VyY2VQYXRoLCBgJHt0YXJnZXRQYXRofS8ke2ZpbGVOYW1lfWApLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgaW1wb3J0ZWQ6ICR7ZmlsZU5hbWV9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9hc3NldF9pbmZvJywgdGl0bGU6ICdSZWFkIGFzc2V0IGluZm8nLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGJhc2ljIG1ldGFkYXRhIGZvciBvbmUgZGI6Ly8gYXNzZXQgcGF0aC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gcGF0aCB0byBxdWVyeS4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QXNzZXRJbmZvKGFzc2V0UGF0aDogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGFzc2V0UGF0aCAmJiB0eXBlb2YgYXNzZXRQYXRoID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgYXNzZXRQYXRoID0gYXNzZXRQYXRoLmFzc2V0UGF0aDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldFBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBc3NldCBub3QgZm91bmQnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpbmZvOiBBc3NldEluZm8gPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0SW5mby5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXRJbmZvLnVybCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXRJbmZvLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IGFzc2V0SW5mby5zaXplLFxuICAgICAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogYXNzZXRJbmZvLmlzRGlyZWN0b3J5XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8ubWV0YSkge1xuICAgICAgICAgICAgICAgICAgICBpbmZvLm1ldGEgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXI6IGFzc2V0SW5mby5tZXRhLnZlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8ubWV0YS5pbXBvcnRlclxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soaW5mbykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdnZXRfYXNzZXRzJywgdGl0bGU6ICdMaXN0IHByb2plY3QgYXNzZXRzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBhc3NldHMgdW5kZXIgYSBmb2xkZXIgdXNpbmcgdHlwZS1zcGVjaWZpYyBmaWxlbmFtZSBwYXR0ZXJucy4gQWxzbyBleHBvc2VkIGFzIHJlc291cmNlIGNvY29zOi8vYXNzZXRzIChkZWZhdWx0cyB0eXBlPWFsbCwgZm9sZGVyPWRiOi8vYXNzZXRzKSBhbmQgY29jb3M6Ly9hc3NldHN7P3R5cGUsZm9sZGVyfSB0ZW1wbGF0ZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouZW51bShbJ2FsbCcsICdzY2VuZScsICdwcmVmYWInLCAnc2NyaXB0JywgJ3RleHR1cmUnLCAnbWF0ZXJpYWwnLCAnbWVzaCcsICdhdWRpbycsICdhbmltYXRpb24nXSkuZGVmYXVsdCgnYWxsJykuZGVzY3JpYmUoJ0Fzc2V0IHR5cGUgZmlsdGVyIHRyYW5zbGF0ZWQgaW50byBmaWxlbmFtZSBwYXR0ZXJucy4nKSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGZvbGRlciB0byBzZWFyY2guIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGdldEFzc2V0cyh0eXBlOiBhbnkgPSAnYWxsJywgZm9sZGVyOiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHR5cGUgJiYgdHlwZW9mIHR5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBmb2xkZXIgPSB0eXBlLmZvbGRlciA/PyAnZGI6Ly9hc3NldHMnO1xuICAgICAgICAgICAgdHlwZSA9IHR5cGUudHlwZSA/PyAnYWxsJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGxldCBwYXR0ZXJuID0gYCR7Zm9sZGVyfS8qKi8qYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5re75Yqg6aGe5Z6L6YGO5r++XG4gICAgICAgICAgICBpZiAodHlwZSAhPT0gJ2FsbCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlRXh0ZW5zaW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgICAgICAgICAgICAgJ3NjZW5lJzogJy5zY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICdwcmVmYWInOiAnLnByZWZhYicsXG4gICAgICAgICAgICAgICAgICAgICdzY3JpcHQnOiAnLnt0cyxqc30nLFxuICAgICAgICAgICAgICAgICAgICAndGV4dHVyZSc6ICcue3BuZyxqcGcsanBlZyxnaWYsdGdhLGJtcCxwc2R9JyxcbiAgICAgICAgICAgICAgICAgICAgJ21hdGVyaWFsJzogJy5tdGwnLFxuICAgICAgICAgICAgICAgICAgICAnbWVzaCc6ICcue2ZieCxvYmosZGFlfScsXG4gICAgICAgICAgICAgICAgICAgICdhdWRpbyc6ICcue21wMyxvZ2csd2F2LG00YX0nLFxuICAgICAgICAgICAgICAgICAgICAnYW5pbWF0aW9uJzogJy57YW5pbSxjbGlwfSdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHR5cGVFeHRlbnNpb25zW3R5cGVdO1xuICAgICAgICAgICAgICAgIGlmIChleHRlbnNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybiA9IGAke2ZvbGRlcn0vKiovKiR7ZXh0ZW5zaW9ufWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOb3RlOiBxdWVyeS1hc3NldHMgQVBJIHBhcmFtZXRlcnMgY29ycmVjdGVkIGJhc2VkIG9uIGRvY3VtZW50YXRpb25cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogcGF0dGVybiB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0cyA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXQudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogYXNzZXQuc2l6ZSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogYXNzZXQuaXNEaXJlY3RvcnkgfHwgZmFsc2VcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBmb2xkZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogYXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0czogYXNzZXRzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZ2V0X2J1aWxkX3NldHRpbmdzJywgdGl0bGU6ICdSZWFkIGJ1aWxkIHNldHRpbmdzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVwb3J0IGJ1aWxkZXIgcmVhZGluZXNzIGFuZCBNQ1AgYnVpbGQgbGltaXRhdGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBnZXRCdWlsZFNldHRpbmdzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5qqi5p+l5qeL5bu65Zmo5piv5ZCm5rqW5YKZ5bCx57eSXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ3F1ZXJ5LXdvcmtlci1yZWFkeScpLnRoZW4oKHJlYWR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBidWlsZGVyUmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0J1aWxkIHNldHRpbmdzIGFyZSBsaW1pdGVkIGluIE1DUCBwbHVnaW4gZW52aXJvbm1lbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlQWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdPcGVuIGJ1aWxkIHBhbmVsIHdpdGggb3Blbl9idWlsZF9wYW5lbCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoZWNrIGJ1aWxkZXIgc3RhdHVzIHdpdGggY2hlY2tfYnVpbGRlcl9zdGF0dXMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdTdGFydCBwcmV2aWV3IHNlcnZlciB3aXRoIHN0YXJ0X3ByZXZpZXdfc2VydmVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnU3RvcCBwcmV2aWV3IHNlcnZlciB3aXRoIHN0b3BfcHJldmlld19zZXJ2ZXInXG4gICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGltaXRhdGlvbjogJ0Z1bGwgYnVpbGQgY29uZmlndXJhdGlvbiByZXF1aXJlcyBkaXJlY3QgRWRpdG9yIFVJIGFjY2VzcydcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdvcGVuX2J1aWxkX3BhbmVsJywgdGl0bGU6ICdPcGVuIGJ1aWxkIHBhbmVsJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gT3BlbiB0aGUgQ29jb3MgQnVpbGQgcGFuZWw7IGRvZXMgbm90IHN0YXJ0IGEgYnVpbGQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBvcGVuQnVpbGRQYW5lbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2J1aWxkZXInLCAnb3BlbicpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnQnVpbGQgcGFuZWwgb3BlbmVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hlY2tfYnVpbGRlcl9zdGF0dXMnLCB0aXRsZTogJ0NoZWNrIGJ1aWxkZXIgc3RhdHVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2hlY2sgd2hldGhlciB0aGUgYnVpbGRlciB3b3JrZXIgaXMgcmVhZHkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pXG4gICAgfSlcbiAgICBhc3luYyBjaGVja0J1aWxkZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ3F1ZXJ5LXdvcmtlci1yZWFkeScpLnRoZW4oKHJlYWR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWFkeTogcmVhZHksXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXM6IHJlYWR5ID8gJ0J1aWxkZXIgd29ya2VyIGlzIHJlYWR5JyA6ICdCdWlsZGVyIHdvcmtlciBpcyBub3QgcmVhZHknLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0J1aWxkZXIgc3RhdHVzIGNoZWNrZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3N0YXJ0X3ByZXZpZXdfc2VydmVyJywgdGl0bGU6ICdTdGFydCBwcmV2aWV3IHNlcnZlcicsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFVuc3VwcG9ydGVkIHByZXZpZXctc2VydmVyIHBsYWNlaG9sZGVyOyB1c2UgRWRpdG9yIFVJLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydDogei5udW1iZXIoKS5kZWZhdWx0KDc0NTYpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgcHJldmlldyBzZXJ2ZXIgcG9ydC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBzdGFydFByZXZpZXdTZXJ2ZXIocG9ydDogYW55ID0gNzQ1Nik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChwb3J0ICYmIHR5cGVvZiBwb3J0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgcG9ydCA9IHBvcnQucG9ydCA/PyA3NDU2O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdQcmV2aWV3IHNlcnZlciBjb250cm9sIGlzIG5vdCBzdXBwb3J0ZWQgdGhyb3VnaCBNQ1AgQVBJJyxcbiAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ1BsZWFzZSBzdGFydCB0aGUgcHJldmlldyBzZXJ2ZXIgbWFudWFsbHkgdXNpbmcgdGhlIGVkaXRvciBtZW51OiBQcm9qZWN0ID4gUHJldmlldywgb3IgdXNlIHRoZSBwcmV2aWV3IHBhbmVsIGluIHRoZSBlZGl0b3InXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnc3RvcF9wcmV2aWV3X3NlcnZlcicsIHRpdGxlOiAnU3RvcCBwcmV2aWV3IHNlcnZlcicsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFVuc3VwcG9ydGVkIHByZXZpZXctc2VydmVyIHBsYWNlaG9sZGVyOyB1c2UgRWRpdG9yIFVJLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KVxuICAgIH0pXG4gICAgYXN5bmMgc3RvcFByZXZpZXdTZXJ2ZXIoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ1ByZXZpZXcgc2VydmVyIGNvbnRyb2wgaXMgbm90IHN1cHBvcnRlZCB0aHJvdWdoIE1DUCBBUEknLFxuICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiAnUGxlYXNlIHN0b3AgdGhlIHByZXZpZXcgc2VydmVyIG1hbnVhbGx5IHVzaW5nIHRoZSBwcmV2aWV3IHBhbmVsIGluIHRoZSBlZGl0b3InXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY3JlYXRlX2Fzc2V0JywgdGl0bGU6ICdDcmVhdGUgYXNzZXQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDcmVhdGUgYW4gYXNzZXQgZmlsZSBvciBmb2xkZXIgdGhyb3VnaCBhc3NldC1kYjsgbnVsbCBjb250ZW50IGNyZWF0ZXMgZm9sZGVyLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgYXNzZXQgZGI6Ly8gVVJMLCBlLmcuIGRiOi8vYXNzZXRzL25ld2ZpbGUuanNvbi4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogei5zdHJpbmcoKS5udWxsYWJsZSgpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZpbGUgY29udGVudC4gUGFzcyBudWxsL29taXQgZm9yIGZvbGRlciBjcmVhdGlvbi4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIGV4aXN0aW5nIHRhcmdldCBpbnN0ZWFkIG9mIGF1dG8tcmVuYW1pbmcuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGNyZWF0ZUFzc2V0KHVybDogYW55LCBjb250ZW50OiBzdHJpbmcgfCBudWxsID0gbnVsbCwgb3ZlcndyaXRlOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAodXJsICYmIHR5cGVvZiB1cmwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gdXJsLmNvbnRlbnQ7XG4gICAgICAgICAgICBvdmVyd3JpdGUgPSB1cmwub3ZlcndyaXRlO1xuICAgICAgICAgICAgdXJsID0gdXJsLnVybDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3ZlcndyaXRlOiBvdmVyd3JpdGUsXG4gICAgICAgICAgICAgICAgcmVuYW1lOiAhb3ZlcndyaXRlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdjcmVhdGUtYXNzZXQnLCB1cmwsIGNvbnRlbnQsIG9wdGlvbnMpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQudXVpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY29udGVudCA9PT0gbnVsbCA/ICdGb2xkZXIgY3JlYXRlZCBzdWNjZXNzZnVsbHknIDogJ0ZpbGUgY3JlYXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY29udGVudCA9PT0gbnVsbCA/ICdGb2xkZXIgY3JlYXRlZCBzdWNjZXNzZnVsbHknIDogJ0ZpbGUgY3JlYXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjb3B5X2Fzc2V0JywgdGl0bGU6ICdDb3B5IGFzc2V0JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29weSBhbiBhc3NldCB0aHJvdWdoIGFzc2V0LWRiOyBtdXRhdGVzIHByb2plY3QgYXNzZXRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2UgYXNzZXQgZGI6Ly8gVVJMLicpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBhc3NldCBkYjovLyBVUkwgb3IgZm9sZGVyIHBhdGguJyksXG4gICAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ092ZXJ3cml0ZSBleGlzdGluZyB0YXJnZXQgaW5zdGVhZCBvZiBhdXRvLXJlbmFtaW5nLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBjb3B5QXNzZXQoc291cmNlOiBhbnksIHRhcmdldD86IHN0cmluZywgb3ZlcndyaXRlOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoc291cmNlICYmIHR5cGVvZiBzb3VyY2UgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB0YXJnZXQgPSBzb3VyY2UudGFyZ2V0O1xuICAgICAgICAgICAgb3ZlcndyaXRlID0gc291cmNlLm92ZXJ3cml0ZTtcbiAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5zb3VyY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogb3ZlcndyaXRlLFxuICAgICAgICAgICAgICAgIHJlbmFtZTogIW92ZXJ3cml0ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnY29weS1hc3NldCcsIHNvdXJjZSwgdGFyZ2V0ISwgb3B0aW9ucykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgY29waWVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgY29waWVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ21vdmVfYXNzZXQnLCB0aXRsZTogJ01vdmUgYXNzZXQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBNb3ZlIG9yIHJlbmFtZSBhbiBhc3NldCB0aHJvdWdoIGFzc2V0LWRiOyBtdXRhdGVzIHByb2plY3QgYXNzZXRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2UgYXNzZXQgZGI6Ly8gVVJMLicpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBhc3NldCBkYjovLyBVUkwgb3IgZm9sZGVyIHBhdGguJyksXG4gICAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ092ZXJ3cml0ZSBleGlzdGluZyB0YXJnZXQgaW5zdGVhZCBvZiBhdXRvLXJlbmFtaW5nLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBtb3ZlQXNzZXQoc291cmNlOiBhbnksIHRhcmdldD86IHN0cmluZywgb3ZlcndyaXRlOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoc291cmNlICYmIHR5cGVvZiBzb3VyY2UgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB0YXJnZXQgPSBzb3VyY2UudGFyZ2V0O1xuICAgICAgICAgICAgb3ZlcndyaXRlID0gc291cmNlLm92ZXJ3cml0ZTtcbiAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5zb3VyY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogb3ZlcndyaXRlLFxuICAgICAgICAgICAgICAgIHJlbmFtZTogIW92ZXJ3cml0ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnbW92ZS1hc3NldCcsIHNvdXJjZSwgdGFyZ2V0ISwgb3B0aW9ucykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgbW92ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBtb3ZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdkZWxldGVfYXNzZXQnLCB0aXRsZTogJ0RlbGV0ZSBhc3NldCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIERlbGV0ZSBvbmUgYXNzZXQtZGIgVVJMOyBtdXRhdGVzIHByb2plY3QgYXNzZXRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgdG8gZGVsZXRlLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBkZWxldGVBc3NldCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1cmwpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBkZWxldGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzYXZlX2Fzc2V0JywgdGl0bGU6ICdTYXZlIGFzc2V0JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gV3JpdGUgc2VyaWFsaXplZCBjb250ZW50IHRvIGFuIGFzc2V0IFVSTDsgdXNlIG9ubHkgZm9yIGtub3duLWdvb2QgZm9ybWF0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMIHdob3NlIGNvbnRlbnQgc2hvdWxkIGJlIHNhdmVkLicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50OiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZXJpYWxpemVkIGFzc2V0IGNvbnRlbnQgdG8gd3JpdGUuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHNhdmVBc3NldCh1cmw6IGFueSwgY29udGVudD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSB1cmwuY29udGVudDtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0JywgdXJsLCBjb250ZW50ISkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgc2F2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBzYXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZWltcG9ydF9hc3NldCcsIHRpdGxlOiAnUmVpbXBvcnQgYXNzZXQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBc2sgYXNzZXQtZGIgdG8gcmVpbXBvcnQgYW4gYXNzZXQ7IHVwZGF0ZXMgaW1wb3J0ZWQgYXNzZXQgc3RhdGUvY2FjaGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCB0byByZWltcG9ydC4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgcmVpbXBvcnRBc3NldCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWltcG9ydC1hc3NldCcsIHVybCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCByZWltcG9ydGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9hc3NldF9wYXRoJywgdGl0bGU6ICdSZXNvbHZlIGFzc2V0IHBhdGgnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXNvbHZlIGFuIGFzc2V0IGRiOi8vIFVSTCB0byBkaXNrIHBhdGguJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCB0byByZXNvbHZlIHRvIGEgZGlzayBwYXRoLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeUFzc2V0UGF0aCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1wYXRoJywgdXJsKS50aGVuKChwYXRoOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgcGF0aCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgcGF0aCBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9hc3NldF91dWlkJywgdGl0bGU6ICdSZXNvbHZlIGFzc2V0IFVVSUQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXNvbHZlIGFuIGFzc2V0IGRiOi8vIFVSTCB0byBVVUlELicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgdG8gcmVzb2x2ZSB0byBVVUlELicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeUFzc2V0VXVpZCh1cmw6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1cmwgJiYgdHlwZW9mIHVybCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC51cmw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgdXJsKS50aGVuKCh1dWlkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgVVVJRCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgVVVJRCBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9hc3NldF91cmwnLCB0aXRsZTogJ1Jlc29sdmUgYXNzZXQgVVJMJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzb2x2ZSBhbiBhc3NldCBVVUlEIHRvIGRiOi8vIFVSTC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gcmVzb2x2ZSB0byBkYjovLyBVUkwuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5QXNzZXRVcmwodXVpZDogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHV1aWQgJiYgdHlwZW9mIHV1aWQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB1dWlkID0gdXVpZC51dWlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgdXVpZCkudGhlbigodXJsOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHVybCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBVUkwgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ0Fzc2V0IFVSTCBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdmaW5kX2Fzc2V0X2J5X25hbWUnLCB0aXRsZTogJ0ZpbmQgYXNzZXQgYnkgbmFtZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNlYXJjaCBhc3NldHMgYnkgbmFtZSB3aXRoIGV4YWN0L3R5cGUvZm9sZGVyIGZpbHRlcnM7IHVzZSB0byBkaXNjb3ZlciBVVUlEcy9wYXRocy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IG5hbWUgc2VhcmNoIHRlcm0uIFBhcnRpYWwgbWF0Y2ggdW5sZXNzIGV4YWN0TWF0Y2g9dHJ1ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3RNYXRjaDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JlcXVpcmUgZXhhY3QgYXNzZXQgbmFtZSBtYXRjaC4gRGVmYXVsdCBmYWxzZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlOiB6LmVudW0oWydhbGwnLCAnc2NlbmUnLCAncHJlZmFiJywgJ3NjcmlwdCcsICd0ZXh0dXJlJywgJ21hdGVyaWFsJywgJ21lc2gnLCAnYXVkaW8nLCAnYW5pbWF0aW9uJywgJ3Nwcml0ZUZyYW1lJ10pLmRlZmF1bHQoJ2FsbCcpLmRlc2NyaWJlKCdBc3NldCB0eXBlIGZpbHRlciBmb3IgdGhlIHNlYXJjaC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGZvbGRlciB0byBzZWFyY2guIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLmRlZmF1bHQoMjApLmRlc2NyaWJlKCdNYXhpbXVtIG1hdGNoZWQgYXNzZXRzIHRvIHJldHVybi4gRGVmYXVsdCAyMC4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZmluZEFzc2V0QnlOYW1lKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgZXhhY3RNYXRjaCA9IGZhbHNlLCBhc3NldFR5cGUgPSAnYWxsJywgZm9sZGVyID0gJ2RiOi8vYXNzZXRzJywgbWF4UmVzdWx0cyA9IDIwIH0gPSBhcmdzO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgYXNzZXRzIGluIHRoZSBzcGVjaWZpZWQgZm9sZGVyXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsQXNzZXRzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldEFzc2V0cyhhc3NldFR5cGUsIGZvbGRlcik7XG4gICAgICAgICAgICAgICAgaWYgKCFhbGxBc3NldHNSZXNwb25zZS5zdWNjZXNzIHx8ICFhbGxBc3NldHNSZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIGdldCBhc3NldHM6ICR7YWxsQXNzZXRzUmVzcG9uc2UuZXJyb3J9YCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbEFzc2V0cyA9IGFsbEFzc2V0c1Jlc3BvbnNlLmRhdGEuYXNzZXRzIGFzIGFueVtdO1xuICAgICAgICAgICAgICAgIGxldCBtYXRjaGVkQXNzZXRzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFNlYXJjaCBmb3IgbWF0Y2hpbmcgYXNzZXRzXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhbGxBc3NldHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXROYW1lID0gYXNzZXQubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1hdGNoZXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGFjdE1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVzID0gYXNzZXROYW1lID09PSBuYW1lO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcyA9IGFzc2V0TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKG5hbWUudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgZGV0YWlsZWQgYXNzZXQgaW5mbyBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGV0YWlsUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldEFzc2V0SW5mbyhhc3NldC5wYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGV0YWlsUmVzcG9uc2Uuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkQXNzZXRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLi4uYXNzZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWxzOiBkZXRhaWxSZXNwb25zZS5kYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZWRBc3NldHMucHVzaChhc3NldCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZEFzc2V0cy5wdXNoKGFzc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoZWRBc3NldHMubGVuZ3RoID49IG1heFJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlYXJjaFRlcm06IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdE1hdGNoLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxGb3VuZDogbWF0Y2hlZEFzc2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRzOiBtYXRjaGVkQXNzZXRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7bWF0Y2hlZEFzc2V0cy5sZW5ndGh9IGFzc2V0cyBtYXRjaGluZyAnJHtuYW1lfSdgXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEFzc2V0IHNlYXJjaCBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdnZXRfYXNzZXRfZGV0YWlscycsIHRpdGxlOiAnUmVhZCBhc3NldCBkZXRhaWxzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBhc3NldCBpbmZvIHBsdXMga25vd24gaW1hZ2Ugc3ViLWFzc2V0cyBzdWNoIGFzIHNwcml0ZUZyYW1lL3RleHR1cmUgVVVJRHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhc3NldFBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIHBhdGggdG8gaW5zcGVjdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZVN1YkFzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnVHJ5IHRvIGluY2x1ZGUga25vd24gaW1hZ2Ugc3ViLWFzc2V0cyBzdWNoIGFzIHNwcml0ZUZyYW1lIGFuZCB0ZXh0dXJlIFVVSURzLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBnZXRBc3NldERldGFpbHMoYXNzZXRQYXRoOiBhbnksIGluY2x1ZGVTdWJBc3NldHM6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGFzc2V0UGF0aCAmJiB0eXBlb2YgYXNzZXRQYXRoID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaW5jbHVkZVN1YkFzc2V0cyA9IGFzc2V0UGF0aC5pbmNsdWRlU3ViQXNzZXRzO1xuICAgICAgICAgICAgYXNzZXRQYXRoID0gYXNzZXRQYXRoLmFzc2V0UGF0aDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gR2V0IGJhc2ljIGFzc2V0IGluZm9cbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm9SZXNwb25zZSA9IGF3YWl0IHRoaXMuZ2V0QXNzZXRJbmZvKGFzc2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm9SZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoYXNzZXRJbmZvUmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGFzc2V0SW5mb1Jlc3BvbnNlLmRhdGE7XG4gICAgICAgICAgICAgICAgY29uc3QgZGV0YWlsZWRJbmZvOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIC4uLmFzc2V0SW5mbyxcbiAgICAgICAgICAgICAgICAgICAgc3ViQXNzZXRzOiBbXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGluY2x1ZGVTdWJBc3NldHMgJiYgYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciBpbWFnZSBhc3NldHMsIHRyeSB0byBnZXQgc3ByaXRlRnJhbWUgYW5kIHRleHR1cmUgc3ViLWFzc2V0c1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvLnR5cGUgPT09ICdjYy5JbWFnZUFzc2V0JyB8fCBhc3NldFBhdGgubWF0Y2goL1xcLihwbmd8anBnfGpwZWd8Z2lmfHRnYXxibXB8cHNkKSQvaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdlbmVyYXRlIGNvbW1vbiBzdWItYXNzZXQgVVVJRHNcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VVdWlkID0gYXNzZXRJbmZvLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwb3NzaWJsZVN1YkFzc2V0cyA9IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IHR5cGU6ICdzcHJpdGVGcmFtZScsIHV1aWQ6IGAke2Jhc2VVdWlkfUBmOTk0MWAsIHN1ZmZpeDogJ0BmOTk0MScgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IHR5cGU6ICd0ZXh0dXJlJywgdXVpZDogYCR7YmFzZVV1aWR9QDZjNDhhYCwgc3VmZml4OiAnQDZjNDhhJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgdHlwZTogJ3RleHR1cmUyRCcsIHV1aWQ6IGAke2Jhc2VVdWlkfUA2YzQ4YWAsIHN1ZmZpeDogJ0A2YzQ4YScgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBzdWJBc3NldCBvZiBwb3NzaWJsZVN1YkFzc2V0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyeSB0byBnZXQgVVJMIGZvciB0aGUgc3ViLWFzc2V0IHRvIHZlcmlmeSBpdCBleGlzdHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViQXNzZXRVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzdWJBc3NldC51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN1YkFzc2V0VXJsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWxlZEluZm8uc3ViQXNzZXRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHN1YkFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogc3ViQXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHN1YkFzc2V0VXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1ZmZpeDogc3ViQXNzZXQuc3VmZml4XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTdWItYXNzZXQgZG9lc24ndCBleGlzdCwgc2tpcCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1ZGVTdWJBc3NldHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5kZXRhaWxlZEluZm8sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgZGV0YWlscyByZXRyaWV2ZWQuIEZvdW5kICR7ZGV0YWlsZWRJbmZvLnN1YkFzc2V0cy5sZW5ndGh9IHN1Yi1hc3NldHMuYFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gZ2V0IGFzc2V0IGRldGFpbHM6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==