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
exports.ServerTools = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
class ServerTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getBuildHash() {
        var _a, _b, _c;
        const hashFile = path.join(__dirname, '../build-hash.json');
        let info;
        try {
            info = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.code) === 'ENOENT') {
                return (0, response_1.ok)({ buildHash: 'dev', gitSha: 'unknown', buildTime: null, note: 'build-hash.json not found — run npm run build to generate it' });
            }
            return (0, response_1.fail)(`Failed to read build-hash.json: ${e.message}`);
        }
        return (0, response_1.ok)({ buildHash: (_a = info.buildHash) !== null && _a !== void 0 ? _a : 'dev', gitSha: (_b = info.gitSha) !== null && _b !== void 0 ? _b : 'unknown', buildTime: (_c = info.buildTime) !== null && _c !== void 0 ? _c : null });
    }
    async checkCodeSync(args) {
        var _a;
        const extRoot = path.join(__dirname, '../..');
        const hashFile = path.join(__dirname, '../build-hash.json');
        let buildInfo = null;
        try {
            buildInfo = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
        }
        catch (_b) { }
        if (!(buildInfo === null || buildInfo === void 0 ? void 0 : buildInfo.buildTime)) {
            return (0, response_1.ok)({ inSync: false, buildInfo: null, staleSourceFiles: [], message: 'No build-hash.json found — run npm run build first' });
        }
        const buildTime = new Date(buildInfo.buildTime).getTime();
        const srcRoot = path.resolve((_a = args.sourceRoot) !== null && _a !== void 0 ? _a : path.join(extRoot, 'source'));
        const resolvedExt = path.resolve(extRoot);
        const rel = path.relative(resolvedExt, srcRoot);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return (0, response_1.fail)('sourceRoot must be within the extension root');
        }
        const staleSourceFiles = [];
        const walk = (dir) => {
            if (!fs.existsSync(dir))
                return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                    continue;
                }
                if (!entry.name.endsWith('.ts'))
                    continue;
                if (fs.statSync(full).mtimeMs > buildTime) {
                    staleSourceFiles.push(full.replace(extRoot + path.sep, '').replace(/\\/g, '/'));
                }
            }
        };
        walk(srcRoot);
        staleSourceFiles.sort();
        const inSync = staleSourceFiles.length === 0;
        return (0, response_1.ok)({
            inSync,
            buildInfo,
            staleSourceFiles,
            message: inSync
                ? 'Extension is in sync with the latest build'
                : `${staleSourceFiles.length} source file(s) newer than last build — run npm run build`,
        });
    }
    async queryServerIPList() {
        const ipList = await Editor.Message.request('server', 'query-ip-list');
        return (0, response_1.ok)({
            ipList: ipList,
            count: ipList.length,
            message: 'IP list retrieved successfully'
        });
    }
    async querySortedServerIPList() {
        const sortedIPList = await Editor.Message.request('server', 'query-sort-ip-list');
        return (0, response_1.ok)({
            sortedIPList: sortedIPList,
            count: sortedIPList.length,
            message: 'Sorted IP list retrieved successfully'
        });
    }
    async queryServerPort() {
        const port = await Editor.Message.request('server', 'query-port');
        return (0, response_1.ok)({
            port: port,
            message: `Editor server is running on port ${port}`
        });
    }
    async getServerStatus() {
        var _a;
        try {
            // Gather comprehensive server information
            const [ipListResult, portResult] = await Promise.allSettled([
                this.queryServerIPList(),
                this.queryServerPort()
            ]);
            const status = {
                timestamp: new Date().toISOString(),
                serverRunning: true
            };
            if (ipListResult.status === 'fulfilled' && ipListResult.value.success) {
                status.availableIPs = ipListResult.value.data.ipList;
                status.ipCount = ipListResult.value.data.count;
            }
            else {
                status.availableIPs = [];
                status.ipCount = 0;
                status.ipError = ipListResult.status === 'rejected' ? ipListResult.reason : ipListResult.value.error;
            }
            if (portResult.status === 'fulfilled' && portResult.value.success) {
                status.port = portResult.value.data.port;
            }
            else {
                status.port = null;
                status.portError = portResult.status === 'rejected' ? portResult.reason : portResult.value.error;
            }
            // Add additional server info
            status.mcpServerPort = 3000; // Our MCP server port
            status.editorVersion = ((_a = Editor.versions) === null || _a === void 0 ? void 0 : _a.cocos) || 'Unknown';
            status.platform = process.platform;
            status.nodeVersion = process.version;
            return (0, response_1.ok)(status);
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to get server status: ${err.message}`);
        }
    }
    async checkServerConnectivity(args) {
        var _a;
        const timeout = (_a = args.timeout) !== null && _a !== void 0 ? _a : 5000;
        const startTime = Date.now();
        try {
            // Test basic Editor API connectivity
            const testPromise = Editor.Message.request('server', 'query-port');
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Connection timeout')), timeout);
            });
            await Promise.race([testPromise, timeoutPromise]);
            const responseTime = Date.now() - startTime;
            return (0, response_1.ok)({
                connected: true,
                responseTime: responseTime,
                timeout: timeout,
                message: `Server connectivity confirmed in ${responseTime}ms`
            });
        }
        catch (err) {
            const responseTime = Date.now() - startTime;
            return {
                success: false,
                data: {
                    connected: false,
                    responseTime: responseTime,
                    timeout: timeout,
                    error: err.message
                }
            };
        }
    }
    async getNetworkInterfaces() {
        try {
            // Get network interfaces using Node.js os module
            const os = require('os');
            const interfaces = os.networkInterfaces();
            const networkInfo = Object.entries(interfaces).map(([name, addresses]) => ({
                name: name,
                addresses: addresses.map((addr) => ({
                    address: addr.address,
                    family: addr.family,
                    internal: addr.internal,
                    cidr: addr.cidr
                }))
            }));
            // Also try to get server IPs for comparison
            const serverIPResult = await this.queryServerIPList();
            return (0, response_1.ok)({
                networkInterfaces: networkInfo,
                serverAvailableIPs: serverIPResult.success ? serverIPResult.data.ipList : [],
                message: 'Network interfaces retrieved successfully'
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to get network interfaces: ${err.message}`);
        }
    }
}
exports.ServerTools = ServerTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_build_hash',
        title: 'Read extension build hash',
        description: '[specialist] Read the build identity (MD5 of dist/main.js + git SHA + buildTime) from dist/build-hash.json. Generated by postbuild script after each npm run build.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "getBuildHash", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'check_code_sync',
        title: 'Check extension code sync',
        description: '[specialist] Compare source TypeScript mtime against dist/build-hash.json buildTime. Returns inSync: true when all .ts files are older than the last build, with a list of stale files otherwise.',
        inputSchema: schema_1.z.object({
            sourceRoot: schema_1.z.string().optional().describe('Absolute path to the source directory to scan. Defaults to the extension source/ directory.'),
        }),
    })
], ServerTools.prototype, "checkCodeSync", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_server_ip_list',
        title: 'Read server IP list',
        description: '[specialist] Read IPs reported by the Cocos Editor server. No project side effects; use to build client connection URLs.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "queryServerIPList", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_sorted_server_ip_list',
        title: 'Read sorted server IPs',
        description: '[specialist] Read the Editor server IP list in preferred order. No project side effects.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "querySortedServerIPList", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_server_port',
        title: 'Read server port',
        description: '[specialist] Read the current Cocos Editor server port. Does not start or stop any server.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "queryServerPort", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_server_status',
        title: 'Read server status',
        description: '[specialist] Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info. Diagnostics only.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "getServerStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'check_server_connectivity',
        title: 'Check server connectivity',
        description: '[specialist] Probe Editor.Message connectivity with server/query-port and a timeout. No project side effects.',
        inputSchema: schema_1.z.object({
            timeout: schema_1.z.number().default(5000).describe('Editor server response timeout in milliseconds. Default 5000.'),
        }),
    })
], ServerTools.prototype, "checkServerConnectivity", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_network_interfaces',
        title: 'Read network interfaces',
        description: '[specialist] Read OS network interfaces and compare with Editor-reported IPs. Diagnostics only.',
        inputSchema: schema_1.z.object({}),
    })
], ServerTools.prototype, "getNetworkInterfaces", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3NlcnZlci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBRXZFLE1BQWEsV0FBVztJQUdwQjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBU25HLEFBQU4sS0FBSyxDQUFDLFlBQVk7O1FBQ2QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RCxJQUFJLElBQVMsQ0FBQztRQUNkLElBQUksQ0FBQztZQUNELElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDekQsQ0FBQztRQUFDLE9BQU8sQ0FBTSxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksTUFBSyxRQUFRLEVBQUUsQ0FBQztnQkFDdkIsT0FBTyxJQUFBLGFBQUUsRUFBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUs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QkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUsb0JBQW9CO1FBQzNCLFdBQVcsRUFBRSx5SEFBeUg7UUFDdEksV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7a0RBeUNEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsMkJBQTJCO1FBQ2pDLEtBQUssRUFBRSwyQkFBMkI7UUFDbEMsV0FBVyxFQUFFLCtHQUErRztRQUM1SCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixPQUFPLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsK0RBQStELENBQUM7U0FDOUcsQ0FBQztLQUNMLENBQUM7MERBb0NEO0FBUUs7SUFOTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsd0JBQXdCO1FBQzlCLEtBQUssRUFBRSx5QkFBeUI7UUFDaEMsV0FBVyxFQUFFLGlHQUFpRztRQUM5RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQzt1REE2QkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcblxuZXhwb3J0IGNsYXNzIFNlcnZlclRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2J1aWxkX2hhc2gnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgZXh0ZW5zaW9uIGJ1aWxkIGhhc2gnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBidWlsZCBpZGVudGl0eSAoTUQ1IG9mIGRpc3QvbWFpbi5qcyArIGdpdCBTSEEgKyBidWlsZFRpbWUpIGZyb20gZGlzdC9idWlsZC1oYXNoLmpzb24uIEdlbmVyYXRlZCBieSBwb3N0YnVpbGQgc2NyaXB0IGFmdGVyIGVhY2ggbnBtIHJ1biBidWlsZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QnVpbGRIYXNoKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGhhc2hGaWxlID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2J1aWxkLWhhc2guanNvbicpO1xuICAgICAgICBsZXQgaW5mbzogYW55O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaW5mbyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGhhc2hGaWxlLCAndXRmOCcpKTtcbiAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICBpZiAoZT8uY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBidWlsZEhhc2g6ICdkZXYnLCBnaXRTaGE6ICd1bmtub3duJywgYnVpbGRUaW1lOiBudWxsLCBub3RlOiAnYnVpbGQtaGFzaC5qc29uIG5vdCBmb3VuZCDigJQgcnVuIG5wbSBydW4gYnVpbGQgdG8gZ2VuZXJhdGUgaXQnIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byByZWFkIGJ1aWxkLWhhc2guanNvbjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKHsgYnVpbGRIYXNoOiBpbmZvLmJ1aWxkSGFzaCA/PyAnZGV2JywgZ2l0U2hhOiBpbmZvLmdpdFNoYSA/PyAndW5rbm93bicsIGJ1aWxkVGltZTogaW5mby5idWlsZFRpbWUgPz8gbnVsbCB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjaGVja19jb2RlX3N5bmMnLFxuICAgICAgICB0aXRsZTogJ0NoZWNrIGV4dGVuc2lvbiBjb2RlIHN5bmMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDb21wYXJlIHNvdXJjZSBUeXBlU2NyaXB0IG10aW1lIGFnYWluc3QgZGlzdC9idWlsZC1oYXNoLmpzb24gYnVpbGRUaW1lLiBSZXR1cm5zIGluU3luYzogdHJ1ZSB3aGVuIGFsbCAudHMgZmlsZXMgYXJlIG9sZGVyIHRoYW4gdGhlIGxhc3QgYnVpbGQsIHdpdGggYSBsaXN0IG9mIHN0YWxlIGZpbGVzIG90aGVyd2lzZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc291cmNlUm9vdDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBwYXRoIHRvIHRoZSBzb3VyY2UgZGlyZWN0b3J5IHRvIHNjYW4uIERlZmF1bHRzIHRvIHRoZSBleHRlbnNpb24gc291cmNlLyBkaXJlY3RvcnkuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY2hlY2tDb2RlU3luYyhhcmdzOiB7IHNvdXJjZVJvb3Q/OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGV4dFJvb3QgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4nKTtcbiAgICAgICAgY29uc3QgaGFzaEZpbGUgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vYnVpbGQtaGFzaC5qc29uJyk7XG4gICAgICAgIGxldCBidWlsZEluZm86IGFueSA9IG51bGw7XG4gICAgICAgIHRyeSB7IGJ1aWxkSW5mbyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGhhc2hGaWxlLCAndXRmOCcpKTsgfSBjYXRjaCB7fVxuICAgICAgICBpZiAoIWJ1aWxkSW5mbz8uYnVpbGRUaW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBpblN5bmM6IGZhbHNlLCBidWlsZEluZm86IG51bGwsIHN0YWxlU291cmNlRmlsZXM6IFtdLCBtZXNzYWdlOiAnTm8gYnVpbGQtaGFzaC5qc29uIGZvdW5kIOKAlCBydW4gbnBtIHJ1biBidWlsZCBmaXJzdCcgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYnVpbGRUaW1lID0gbmV3IERhdGUoYnVpbGRJbmZvLmJ1aWxkVGltZSkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zdCBzcmNSb290ID0gcGF0aC5yZXNvbHZlKGFyZ3Muc291cmNlUm9vdCA/PyBwYXRoLmpvaW4oZXh0Um9vdCwgJ3NvdXJjZScpKTtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRFeHQgPSBwYXRoLnJlc29sdmUoZXh0Um9vdCk7XG4gICAgICAgIGNvbnN0IHJlbCA9IHBhdGgucmVsYXRpdmUocmVzb2x2ZWRFeHQsIHNyY1Jvb3QpO1xuICAgICAgICBpZiAocmVsLnN0YXJ0c1dpdGgoJy4uJykgfHwgcGF0aC5pc0Fic29sdXRlKHJlbCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdzb3VyY2VSb290IG11c3QgYmUgd2l0aGluIHRoZSBleHRlbnNpb24gcm9vdCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YWxlU291cmNlRmlsZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IHdhbGsgPSAoZGlyOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSByZXR1cm47XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGZzLnJlYWRkaXJTeW5jKGRpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnVsbCA9IHBhdGguam9pbihkaXIsIGVudHJ5Lm5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7IHdhbGsoZnVsbCk7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgICAgICAgaWYgKCFlbnRyeS5uYW1lLmVuZHNXaXRoKCcudHMnKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgaWYgKGZzLnN0YXRTeW5jKGZ1bGwpLm10aW1lTXMgPiBidWlsZFRpbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhbGVTb3VyY2VGaWxlcy5wdXNoKGZ1bGwucmVwbGFjZShleHRSb290ICsgcGF0aC5zZXAsICcnKS5yZXBsYWNlKC9cXFxcL2csICcvJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgd2FsayhzcmNSb290KTtcbiAgICAgICAgc3RhbGVTb3VyY2VGaWxlcy5zb3J0KCk7XG4gICAgICAgIGNvbnN0IGluU3luYyA9IHN0YWxlU291cmNlRmlsZXMubGVuZ3RoID09PSAwO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgaW5TeW5jLFxuICAgICAgICAgICAgYnVpbGRJbmZvLFxuICAgICAgICAgICAgc3RhbGVTb3VyY2VGaWxlcyxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGluU3luY1xuICAgICAgICAgICAgICAgID8gJ0V4dGVuc2lvbiBpcyBpbiBzeW5jIHdpdGggdGhlIGxhdGVzdCBidWlsZCdcbiAgICAgICAgICAgICAgICA6IGAke3N0YWxlU291cmNlRmlsZXMubGVuZ3RofSBzb3VyY2UgZmlsZShzKSBuZXdlciB0aGFuIGxhc3QgYnVpbGQg4oCUIHJ1biBucG0gcnVuIGJ1aWxkYCxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncXVlcnlfc2VydmVyX2lwX2xpc3QnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2VydmVyIElQIGxpc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIElQcyByZXBvcnRlZCBieSB0aGUgQ29jb3MgRWRpdG9yIHNlcnZlci4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHM7IHVzZSB0byBidWlsZCBjbGllbnQgY29ubmVjdGlvbiBVUkxzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeVNlcnZlcklQTGlzdCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpcExpc3Q6IHN0cmluZ1tdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2VydmVyJywgJ3F1ZXJ5LWlwLWxpc3QnKTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBpcExpc3Q6IGlwTGlzdCxcbiAgICAgICAgICAgICAgICBjb3VudDogaXBMaXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnSVAgbGlzdCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncXVlcnlfc29ydGVkX3NlcnZlcl9pcF9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHNvcnRlZCBzZXJ2ZXIgSVBzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgRWRpdG9yIHNlcnZlciBJUCBsaXN0IGluIHByZWZlcnJlZCBvcmRlci4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5U29ydGVkU2VydmVySVBMaXN0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNvcnRlZElQTGlzdDogc3RyaW5nW10gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktc29ydC1pcC1saXN0Jyk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgc29ydGVkSVBMaXN0OiBzb3J0ZWRJUExpc3QsXG4gICAgICAgICAgICAgICAgY291bnQ6IHNvcnRlZElQTGlzdC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NvcnRlZCBJUCBsaXN0IHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV9zZXJ2ZXJfcG9ydCcsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzZXJ2ZXIgcG9ydCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgdGhlIGN1cnJlbnQgQ29jb3MgRWRpdG9yIHNlcnZlciBwb3J0LiBEb2VzIG5vdCBzdGFydCBvciBzdG9wIGFueSBzZXJ2ZXIuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5U2VydmVyUG9ydCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwb3J0OiBudW1iZXIgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktcG9ydCcpO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHBvcnQ6IHBvcnQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEVkaXRvciBzZXJ2ZXIgaXMgcnVubmluZyBvbiBwb3J0ICR7cG9ydH1gXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfc2VydmVyX3N0YXR1cycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzZXJ2ZXIgc3RhdHVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29sbGVjdCBFZGl0b3Igc2VydmVyIElQL3BvcnQsIE1DUCBwb3J0LCBDb2NvcyB2ZXJzaW9uLCBwbGF0Zm9ybSwgYW5kIE5vZGUgcnVudGltZSBpbmZvLiBEaWFnbm9zdGljcyBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTZXJ2ZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEdhdGhlciBjb21wcmVoZW5zaXZlIHNlcnZlciBpbmZvcm1hdGlvblxuICAgICAgICAgICAgY29uc3QgW2lwTGlzdFJlc3VsdCwgcG9ydFJlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlTZXJ2ZXJJUExpc3QoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5U2VydmVyUG9ydCgpXG4gICAgICAgICAgICBdKTtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHVzOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgc2VydmVyUnVubmluZzogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKGlwTGlzdFJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGlwTGlzdFJlc3VsdC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmF2YWlsYWJsZUlQcyA9IGlwTGlzdFJlc3VsdC52YWx1ZS5kYXRhLmlwTGlzdDtcbiAgICAgICAgICAgICAgICBzdGF0dXMuaXBDb3VudCA9IGlwTGlzdFJlc3VsdC52YWx1ZS5kYXRhLmNvdW50O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdGF0dXMuYXZhaWxhYmxlSVBzID0gW107XG4gICAgICAgICAgICAgICAgc3RhdHVzLmlwQ291bnQgPSAwO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5pcEVycm9yID0gaXBMaXN0UmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IGlwTGlzdFJlc3VsdC5yZWFzb24gOiBpcExpc3RSZXN1bHQudmFsdWUuZXJyb3I7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwb3J0UmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgcG9ydFJlc3VsdC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzLnBvcnQgPSBwb3J0UmVzdWx0LnZhbHVlLmRhdGEucG9ydDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzLnBvcnQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5wb3J0RXJyb3IgPSBwb3J0UmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IHBvcnRSZXN1bHQucmVhc29uIDogcG9ydFJlc3VsdC52YWx1ZS5lcnJvcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGFkZGl0aW9uYWwgc2VydmVyIGluZm9cbiAgICAgICAgICAgIHN0YXR1cy5tY3BTZXJ2ZXJQb3J0ID0gMzAwMDsgLy8gT3VyIE1DUCBzZXJ2ZXIgcG9ydFxuICAgICAgICAgICAgc3RhdHVzLmVkaXRvclZlcnNpb24gPSAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJztcbiAgICAgICAgICAgIHN0YXR1cy5wbGF0Zm9ybSA9IHByb2Nlc3MucGxhdGZvcm07XG4gICAgICAgICAgICBzdGF0dXMubm9kZVZlcnNpb24gPSBwcm9jZXNzLnZlcnNpb247XG5cbiAgICAgICAgICAgIHJldHVybiBvayhzdGF0dXMpO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGdldCBzZXJ2ZXIgc3RhdHVzOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY2hlY2tfc2VydmVyX2Nvbm5lY3Rpdml0eScsXG4gICAgICAgIHRpdGxlOiAnQ2hlY2sgc2VydmVyIGNvbm5lY3Rpdml0eScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFByb2JlIEVkaXRvci5NZXNzYWdlIGNvbm5lY3Rpdml0eSB3aXRoIHNlcnZlci9xdWVyeS1wb3J0IGFuZCBhIHRpbWVvdXQuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB0aW1lb3V0OiB6Lm51bWJlcigpLmRlZmF1bHQoNTAwMCkuZGVzY3JpYmUoJ0VkaXRvciBzZXJ2ZXIgcmVzcG9uc2UgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuIERlZmF1bHQgNTAwMC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjaGVja1NlcnZlckNvbm5lY3Rpdml0eShhcmdzOiB7IHRpbWVvdXQ/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSBhcmdzLnRpbWVvdXQgPz8gNTAwMDtcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gVGVzdCBiYXNpYyBFZGl0b3IgQVBJIGNvbm5lY3Rpdml0eVxuICAgICAgICAgICAgY29uc3QgdGVzdFByb21pc2UgPSBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktcG9ydCcpO1xuICAgICAgICAgICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZSgoXywgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdDb25uZWN0aW9uIHRpbWVvdXQnKSksIHRpbWVvdXQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UucmFjZShbdGVzdFByb21pc2UsIHRpbWVvdXRQcm9taXNlXSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZVRpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29ubmVjdGVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICByZXNwb25zZVRpbWU6IHJlc3BvbnNlVGltZSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dDogdGltZW91dCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNlcnZlciBjb25uZWN0aXZpdHkgY29uZmlybWVkIGluICR7cmVzcG9uc2VUaW1lfW1zYFxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZVRpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbm5lY3RlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlVGltZTogcmVzcG9uc2VUaW1lLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aW1lb3V0LFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X25ldHdvcmtfaW50ZXJmYWNlcycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBuZXR3b3JrIGludGVyZmFjZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIE9TIG5ldHdvcmsgaW50ZXJmYWNlcyBhbmQgY29tcGFyZSB3aXRoIEVkaXRvci1yZXBvcnRlZCBJUHMuIERpYWdub3N0aWNzIG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldE5ldHdvcmtJbnRlcmZhY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBHZXQgbmV0d29yayBpbnRlcmZhY2VzIHVzaW5nIE5vZGUuanMgb3MgbW9kdWxlXG4gICAgICAgICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICAgICAgICBjb25zdCBpbnRlcmZhY2VzID0gb3MubmV0d29ya0ludGVyZmFjZXMoKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG5ldHdvcmtJbmZvID0gT2JqZWN0LmVudHJpZXMoaW50ZXJmYWNlcykubWFwKChbbmFtZSwgYWRkcmVzc2VzXTogW3N0cmluZywgYW55XSkgPT4gKHtcbiAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgIGFkZHJlc3NlczogYWRkcmVzc2VzLm1hcCgoYWRkcjogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBhZGRyZXNzOiBhZGRyLmFkZHJlc3MsXG4gICAgICAgICAgICAgICAgICAgIGZhbWlseTogYWRkci5mYW1pbHksXG4gICAgICAgICAgICAgICAgICAgIGludGVybmFsOiBhZGRyLmludGVybmFsLFxuICAgICAgICAgICAgICAgICAgICBjaWRyOiBhZGRyLmNpZHJcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLy8gQWxzbyB0cnkgdG8gZ2V0IHNlcnZlciBJUHMgZm9yIGNvbXBhcmlzb25cbiAgICAgICAgICAgIGNvbnN0IHNlcnZlcklQUmVzdWx0ID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZlcklQTGlzdCgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbmV0d29ya0ludGVyZmFjZXM6IG5ldHdvcmtJbmZvLFxuICAgICAgICAgICAgICAgICAgICBzZXJ2ZXJBdmFpbGFibGVJUHM6IHNlcnZlcklQUmVzdWx0LnN1Y2Nlc3MgPyBzZXJ2ZXJJUFJlc3VsdC5kYXRhLmlwTGlzdCA6IFtdLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTmV0d29yayBpbnRlcmZhY2VzIHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gZ2V0IG5ldHdvcmsgaW50ZXJmYWNlczogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==