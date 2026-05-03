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
        if (!fs.existsSync(hashFile)) {
            return (0, response_1.ok)({ buildHash: 'dev', gitSha: 'unknown', buildTime: null, note: 'build-hash.json not found — run npm run build to generate it' });
        }
        try {
            const info = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
            return (0, response_1.ok)({ buildHash: (_a = info.buildHash) !== null && _a !== void 0 ? _a : 'dev', gitSha: (_b = info.gitSha) !== null && _b !== void 0 ? _b : 'unknown', buildTime: (_c = info.buildTime) !== null && _c !== void 0 ? _c : null });
        }
        catch (e) {
            return (0, response_1.fail)(`Failed to read build-hash.json: ${e.message}`);
        }
    }
    async checkCodeSync(args) {
        var _a;
        const extRoot = path.join(__dirname, '../..');
        const hashFile = path.join(__dirname, '../build-hash.json');
        let buildInfo = null;
        if (fs.existsSync(hashFile)) {
            try {
                buildInfo = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
            }
            catch (_b) { }
        }
        if (!(buildInfo === null || buildInfo === void 0 ? void 0 : buildInfo.buildTime)) {
            return (0, response_1.ok)({ inSync: false, buildInfo: null, staleSourceFiles: [], message: 'No build-hash.json found — run npm run build first' });
        }
        const buildTime = new Date(buildInfo.buildTime).getTime();
        const srcRoot = path.resolve((_a = args.sourceRoot) !== null && _a !== void 0 ? _a : path.join(extRoot, 'source'));
        const resolvedExt = path.resolve(extRoot);
        if (!srcRoot.startsWith(resolvedExt + path.sep) && srcRoot !== resolvedExt) {
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
        return new Promise(async (resolve) => {
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
                resolve((0, response_1.ok)(status));
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to get server status: ${err.message}`));
            }
        });
    }
    async checkServerConnectivity(args) {
        var _a;
        const timeout = (_a = args.timeout) !== null && _a !== void 0 ? _a : 5000;
        return new Promise(async (resolve) => {
            const startTime = Date.now();
            try {
                // Test basic Editor API connectivity
                const testPromise = Editor.Message.request('server', 'query-port');
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Connection timeout')), timeout);
                });
                await Promise.race([testPromise, timeoutPromise]);
                const responseTime = Date.now() - startTime;
                resolve((0, response_1.ok)({
                    connected: true,
                    responseTime: responseTime,
                    timeout: timeout,
                    message: `Server connectivity confirmed in ${responseTime}ms`
                }));
            }
            catch (err) {
                const responseTime = Date.now() - startTime;
                resolve({
                    success: false,
                    data: {
                        connected: false,
                        responseTime: responseTime,
                        timeout: timeout,
                        error: err.message
                    }
                });
            }
        });
    }
    async getNetworkInterfaces() {
        return new Promise(async (resolve) => {
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
                resolve((0, response_1.ok)({
                    networkInterfaces: networkInfo,
                    serverAvailableIPs: serverIPResult.success ? serverIPResult.data.ipList : [],
                    message: 'Network interfaces retrieved successfully'
                }));
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to get network interfaces: ${err.message}`));
            }
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3NlcnZlci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBRXZFLE1BQWEsV0FBVztJQUdwQjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBU25HLEFBQU4sS0FBSyxDQUFDLFlBQVk7O1FBQ2QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzNCLE9BQU8sSUFBQSxhQUFFLEVBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsOERBQThELEVBQUUsQ0FBQyxDQUFDO1FBQzlJLENBQUM7UUFDRCxJQUFJLENBQUM7WUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDM0QsT0FBTyxJQUFB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QTZCO1FBQ25DLEtBQUssRUFBRSx3QkFBd0I7UUFDL0IsV0FBVyxFQUFFLDBGQUEwRjtRQUN2RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQzswREFRRDtBQVFLO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUsa0JBQWtCO1FBQ3pCLFdBQVcsRUFBRSw0RkFBNEY7UUFDekcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7a0RBT0Q7QUFRSztJQU5MLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxtQkFBbUI7UUFDekIsS0FBSyxFQUFFLG9CQUFvQjtRQUMzQixXQUFXLEVBQUUseUhBQXlIO1FBQ3RJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztLQUM1QixDQUFDO2tEQTJDRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxLQUFLLEVBQUUsMkJBQTJCO1FBQ2xDLFdBQVcsRUFBRSwrR0FBK0c7UUFDNUgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsT0FBTyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLCtEQUErRCxDQUFDO1NBQzlHLENBQUM7S0FDTCxDQUFDOzBEQXNDRDtBQVFLO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHdCQUF3QjtRQUM5QixLQUFLLEVBQUUseUJBQXlCO1FBQ2hDLFdBQVcsRUFBRSxpR0FBaUc7UUFDOUcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7dURBK0JEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuXG5leHBvcnQgY2xhc3MgU2VydmVyVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfYnVpbGRfaGFzaCcsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBleHRlbnNpb24gYnVpbGQgaGFzaCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgdGhlIGJ1aWxkIGlkZW50aXR5IChNRDUgb2YgZGlzdC9tYWluLmpzICsgZ2l0IFNIQSArIGJ1aWxkVGltZSkgZnJvbSBkaXN0L2J1aWxkLWhhc2guanNvbi4gR2VuZXJhdGVkIGJ5IHBvc3RidWlsZCBzY3JpcHQgYWZ0ZXIgZWFjaCBucG0gcnVuIGJ1aWxkLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRCdWlsZEhhc2goKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaGFzaEZpbGUgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vYnVpbGQtaGFzaC5qc29uJyk7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhoYXNoRmlsZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGJ1aWxkSGFzaDogJ2RldicsIGdpdFNoYTogJ3Vua25vd24nLCBidWlsZFRpbWU6IG51bGwsIG5vdGU6ICdidWlsZC1oYXNoLmpzb24gbm90IGZvdW5kIOKAlCBydW4gbnBtIHJ1biBidWlsZCB0byBnZW5lcmF0ZSBpdCcgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGluZm8gPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhoYXNoRmlsZSwgJ3V0ZjgnKSk7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBidWlsZEhhc2g6IGluZm8uYnVpbGRIYXNoID8/ICdkZXYnLCBnaXRTaGE6IGluZm8uZ2l0U2hhID8/ICd1bmtub3duJywgYnVpbGRUaW1lOiBpbmZvLmJ1aWxkVGltZSA/PyBudWxsIH0pO1xuICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gcmVhZCBidWlsZC1oYXNoLmpzb246ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY2hlY2tfY29kZV9zeW5jJyxcbiAgICAgICAgdGl0bGU6ICdDaGVjayBleHRlbnNpb24gY29kZSBzeW5jJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29tcGFyZSBzb3VyY2UgVHlwZVNjcmlwdCBtdGltZSBhZ2FpbnN0IGRpc3QvYnVpbGQtaGFzaC5qc29uIGJ1aWxkVGltZS4gUmV0dXJucyBpblN5bmM6IHRydWUgd2hlbiBhbGwgLnRzIGZpbGVzIGFyZSBvbGRlciB0aGFuIHRoZSBsYXN0IGJ1aWxkLCB3aXRoIGEgbGlzdCBvZiBzdGFsZSBmaWxlcyBvdGhlcndpc2UuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHNvdXJjZVJvb3Q6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgcGF0aCB0byB0aGUgc291cmNlIGRpcmVjdG9yeSB0byBzY2FuLiBEZWZhdWx0cyB0byB0aGUgZXh0ZW5zaW9uIHNvdXJjZS8gZGlyZWN0b3J5LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNoZWNrQ29kZVN5bmMoYXJnczogeyBzb3VyY2VSb290Pzogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBleHRSb290ID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uJyk7XG4gICAgICAgIGNvbnN0IGhhc2hGaWxlID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2J1aWxkLWhhc2guanNvbicpO1xuICAgICAgICBsZXQgYnVpbGRJbmZvOiBhbnkgPSBudWxsO1xuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhoYXNoRmlsZSkpIHtcbiAgICAgICAgICAgIHRyeSB7IGJ1aWxkSW5mbyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGhhc2hGaWxlLCAndXRmOCcpKTsgfSBjYXRjaCB7fVxuICAgICAgICB9XG4gICAgICAgIGlmICghYnVpbGRJbmZvPy5idWlsZFRpbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGluU3luYzogZmFsc2UsIGJ1aWxkSW5mbzogbnVsbCwgc3RhbGVTb3VyY2VGaWxlczogW10sIG1lc3NhZ2U6ICdObyBidWlsZC1oYXNoLmpzb24gZm91bmQg4oCUIHJ1biBucG0gcnVuIGJ1aWxkIGZpcnN0JyB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBidWlsZFRpbWUgPSBuZXcgRGF0ZShidWlsZEluZm8uYnVpbGRUaW1lKS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IHNyY1Jvb3QgPSBwYXRoLnJlc29sdmUoYXJncy5zb3VyY2VSb290ID8/IHBhdGguam9pbihleHRSb290LCAnc291cmNlJykpO1xyXG4gICAgICAgIGNvbnN0IHJlc29sdmVkRXh0ID0gcGF0aC5yZXNvbHZlKGV4dFJvb3QpO1xyXG4gICAgICAgIGlmICghc3JjUm9vdC5zdGFydHNXaXRoKHJlc29sdmVkRXh0ICsgcGF0aC5zZXApICYmIHNyY1Jvb3QgIT09IHJlc29sdmVkRXh0KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdzb3VyY2VSb290IG11c3QgYmUgd2l0aGluIHRoZSBleHRlbnNpb24gcm9vdCcpO1xyXG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhbGVTb3VyY2VGaWxlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3Qgd2FsayA9IChkaXI6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpcikpIHJldHVybjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZnMucmVhZGRpclN5bmMoZGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmdWxsID0gcGF0aC5qb2luKGRpciwgZW50cnkubmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KCkpIHsgd2FsayhmdWxsKTsgY29udGludWU7IH1cbiAgICAgICAgICAgICAgICBpZiAoIWVudHJ5Lm5hbWUuZW5kc1dpdGgoJy50cycpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBpZiAoZnMuc3RhdFN5bmMoZnVsbCkubXRpbWVNcyA+IGJ1aWxkVGltZSkge1xuICAgICAgICAgICAgICAgICAgICBzdGFsZVNvdXJjZUZpbGVzLnB1c2goZnVsbC5yZXBsYWNlKGV4dFJvb3QgKyBwYXRoLnNlcCwgJycpLnJlcGxhY2UoL1xcXFwvZywgJy8nKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB3YWxrKHNyY1Jvb3QpO1xuICAgICAgICBzdGFsZVNvdXJjZUZpbGVzLnNvcnQoKTtcbiAgICAgICAgY29uc3QgaW5TeW5jID0gc3RhbGVTb3VyY2VGaWxlcy5sZW5ndGggPT09IDA7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICBpblN5bmMsXG4gICAgICAgICAgICBidWlsZEluZm8sXG4gICAgICAgICAgICBzdGFsZVNvdXJjZUZpbGVzLFxuICAgICAgICAgICAgbWVzc2FnZTogaW5TeW5jXG4gICAgICAgICAgICAgICAgPyAnRXh0ZW5zaW9uIGlzIGluIHN5bmMgd2l0aCB0aGUgbGF0ZXN0IGJ1aWxkJ1xuICAgICAgICAgICAgICAgIDogYCR7c3RhbGVTb3VyY2VGaWxlcy5sZW5ndGh9IHNvdXJjZSBmaWxlKHMpIG5ld2VyIHRoYW4gbGFzdCBidWlsZCDigJQgcnVuIG5wbSBydW4gYnVpbGRgLFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV9zZXJ2ZXJfaXBfbGlzdCcsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzZXJ2ZXIgSVAgbGlzdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgSVBzIHJlcG9ydGVkIGJ5IHRoZSBDb2NvcyBFZGl0b3Igc2VydmVyLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0czsgdXNlIHRvIGJ1aWxkIGNsaWVudCBjb25uZWN0aW9uIFVSTHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5U2VydmVySVBMaXN0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlwTGlzdDogc3RyaW5nW10gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktaXAtbGlzdCcpO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGlwTGlzdDogaXBMaXN0LFxuICAgICAgICAgICAgICAgIGNvdW50OiBpcExpc3QubGVuZ3RoLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdJUCBsaXN0IHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV9zb3J0ZWRfc2VydmVyX2lwX2xpc3QnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc29ydGVkIHNlcnZlciBJUHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBFZGl0b3Igc2VydmVyIElQIGxpc3QgaW4gcHJlZmVycmVkIG9yZGVyLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgcXVlcnlTb3J0ZWRTZXJ2ZXJJUExpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc29ydGVkSVBMaXN0OiBzdHJpbmdbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NlcnZlcicsICdxdWVyeS1zb3J0LWlwLWxpc3QnKTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBzb3J0ZWRJUExpc3Q6IHNvcnRlZElQTGlzdCxcbiAgICAgICAgICAgICAgICBjb3VudDogc29ydGVkSVBMaXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU29ydGVkIElQIGxpc3QgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3F1ZXJ5X3NlcnZlcl9wb3J0JyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHNlcnZlciBwb3J0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgY3VycmVudCBDb2NvcyBFZGl0b3Igc2VydmVyIHBvcnQuIERvZXMgbm90IHN0YXJ0IG9yIHN0b3AgYW55IHNlcnZlci4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgcXVlcnlTZXJ2ZXJQb3J0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHBvcnQ6IG51bWJlciA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NlcnZlcicsICdxdWVyeS1wb3J0Jyk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgcG9ydDogcG9ydCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRWRpdG9yIHNlcnZlciBpcyBydW5uaW5nIG9uIHBvcnQgJHtwb3J0fWBcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zZXJ2ZXJfc3RhdHVzJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHNlcnZlciBzdGF0dXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDb2xsZWN0IEVkaXRvciBzZXJ2ZXIgSVAvcG9ydCwgTUNQIHBvcnQsIENvY29zIHZlcnNpb24sIHBsYXRmb3JtLCBhbmQgTm9kZSBydW50aW1lIGluZm8uIERpYWdub3N0aWNzIG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFNlcnZlclN0YXR1cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gR2F0aGVyIGNvbXByZWhlbnNpdmUgc2VydmVyIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgY29uc3QgW2lwTGlzdFJlc3VsdCwgcG9ydFJlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5U2VydmVySVBMaXN0KCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlTZXJ2ZXJQb3J0KClcbiAgICAgICAgICAgICAgICBdKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1czogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgc2VydmVyUnVubmluZzogdHJ1ZVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBpZiAoaXBMaXN0UmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaXBMaXN0UmVzdWx0LnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmF2YWlsYWJsZUlQcyA9IGlwTGlzdFJlc3VsdC52YWx1ZS5kYXRhLmlwTGlzdDtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmlwQ291bnQgPSBpcExpc3RSZXN1bHQudmFsdWUuZGF0YS5jb3VudDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuYXZhaWxhYmxlSVBzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pcENvdW50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmlwRXJyb3IgPSBpcExpc3RSZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnID8gaXBMaXN0UmVzdWx0LnJlYXNvbiA6IGlwTGlzdFJlc3VsdC52YWx1ZS5lcnJvcjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocG9ydFJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIHBvcnRSZXN1bHQudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMucG9ydCA9IHBvcnRSZXN1bHQudmFsdWUuZGF0YS5wb3J0O1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5wb3J0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLnBvcnRFcnJvciA9IHBvcnRSZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnID8gcG9ydFJlc3VsdC5yZWFzb24gOiBwb3J0UmVzdWx0LnZhbHVlLmVycm9yO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFkZCBhZGRpdGlvbmFsIHNlcnZlciBpbmZvXG4gICAgICAgICAgICAgICAgc3RhdHVzLm1jcFNlcnZlclBvcnQgPSAzMDAwOyAvLyBPdXIgTUNQIHNlcnZlciBwb3J0XG4gICAgICAgICAgICAgICAgc3RhdHVzLmVkaXRvclZlcnNpb24gPSAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJztcbiAgICAgICAgICAgICAgICBzdGF0dXMucGxhdGZvcm0gPSBwcm9jZXNzLnBsYXRmb3JtO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5ub2RlVmVyc2lvbiA9IHByb2Nlc3MudmVyc2lvbjtcblxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soc3RhdHVzKSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gZ2V0IHNlcnZlciBzdGF0dXM6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjaGVja19zZXJ2ZXJfY29ubmVjdGl2aXR5JyxcbiAgICAgICAgdGl0bGU6ICdDaGVjayBzZXJ2ZXIgY29ubmVjdGl2aXR5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUHJvYmUgRWRpdG9yLk1lc3NhZ2UgY29ubmVjdGl2aXR5IHdpdGggc2VydmVyL3F1ZXJ5LXBvcnQgYW5kIGEgdGltZW91dC4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IHoubnVtYmVyKCkuZGVmYXVsdCg1MDAwKS5kZXNjcmliZSgnRWRpdG9yIHNlcnZlciByZXNwb25zZSB0aW1lb3V0IGluIG1pbGxpc2Vjb25kcy4gRGVmYXVsdCA1MDAwLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNoZWNrU2VydmVyQ29ubmVjdGl2aXR5KGFyZ3M6IHsgdGltZW91dD86IG51bWJlciB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdGltZW91dCA9IGFyZ3MudGltZW91dCA/PyA1MDAwO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gVGVzdCBiYXNpYyBFZGl0b3IgQVBJIGNvbm5lY3Rpdml0eVxuICAgICAgICAgICAgICAgIGNvbnN0IHRlc3RQcm9taXNlID0gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2VydmVyJywgJ3F1ZXJ5LXBvcnQnKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlKChfLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdDb25uZWN0aW9uIHRpbWVvdXQnKSksIHRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5yYWNlKFt0ZXN0UHJvbWlzZSwgdGltZW91dFByb21pc2VdKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZVRpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29ubmVjdGVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VUaW1lOiByZXNwb25zZVRpbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aW1lb3V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNlcnZlciBjb25uZWN0aXZpdHkgY29uZmlybWVkIGluICR7cmVzcG9uc2VUaW1lfW1zYFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VUaW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbm5lY3RlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZVRpbWU6IHJlc3BvbnNlVGltZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVvdXQ6IHRpbWVvdXQsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfbmV0d29ya19pbnRlcmZhY2VzJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIG5ldHdvcmsgaW50ZXJmYWNlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgT1MgbmV0d29yayBpbnRlcmZhY2VzIGFuZCBjb21wYXJlIHdpdGggRWRpdG9yLXJlcG9ydGVkIElQcy4gRGlhZ25vc3RpY3Mgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0TmV0d29ya0ludGVyZmFjZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIEdldCBuZXR3b3JrIGludGVyZmFjZXMgdXNpbmcgTm9kZS5qcyBvcyBtb2R1bGVcbiAgICAgICAgICAgICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgaW50ZXJmYWNlcyA9IG9zLm5ldHdvcmtJbnRlcmZhY2VzKCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgbmV0d29ya0luZm8gPSBPYmplY3QuZW50cmllcyhpbnRlcmZhY2VzKS5tYXAoKFtuYW1lLCBhZGRyZXNzZXNdOiBbc3RyaW5nLCBhbnldKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICBhZGRyZXNzZXM6IGFkZHJlc3Nlcy5tYXAoKGFkZHI6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZHJlc3M6IGFkZHIuYWRkcmVzcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZhbWlseTogYWRkci5mYW1pbHksXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcm5hbDogYWRkci5pbnRlcm5hbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNpZHI6IGFkZHIuY2lkclxuICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgICAvLyBBbHNvIHRyeSB0byBnZXQgc2VydmVyIElQcyBmb3IgY29tcGFyaXNvblxuICAgICAgICAgICAgICAgIGNvbnN0IHNlcnZlcklQUmVzdWx0ID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZlcklQTGlzdCgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya0ludGVyZmFjZXM6IG5ldHdvcmtJbmZvLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2VydmVyQXZhaWxhYmxlSVBzOiBzZXJ2ZXJJUFJlc3VsdC5zdWNjZXNzID8gc2VydmVySVBSZXN1bHQuZGF0YS5pcExpc3QgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOZXR3b3JrIGludGVyZmFjZXMgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIGdldCBuZXR3b3JrIGludGVyZmFjZXM6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=