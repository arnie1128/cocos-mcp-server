"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
class ServerTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3NlcnZlci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUFFM0MsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUV2RSxNQUFhLFdBQVc7SUFHcEI7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVFuRyxBQUFOLEtBQUssQ0FBQyxpQkFBaUI7UUFDbkIsTUFBTSxNQUFNLEdBQWEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDakYsT0FBTyxJQUFBLGFBQUUsRUFBQztZQUNGLE1BQU0sRUFBRSxNQUFNO1lBQ2QsS0FBSyxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3BCLE9BQU8sRUFBRSxnQ0FBZ0M7U0FDNUMsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLHVCQUF1QjtRQUN6QixNQUFNLFlBQVksR0FBYSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzVGLE9BQU8sSUFBQSxhQUFFLEVBQUM7WUFDRixZQUFZLEVBQUUsWUFBWTtZQUMxQixLQUFLLEVBQUUsWUFBWSxDQUFDLE1BQU07WUFDMUIsT0FBTyxFQUFFLHVDQUF1QztTQUNuRCxDQUFDLENBQUM7SUFD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LG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsMkJBQTJCO1FBQ2pDLEtBQUssRUFBRSwyQkFBMkI7UUFDbEMsV0FBVyxFQUFFLCtHQUErRztRQUM1SCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixPQUFPLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsK0RBQStELENBQUM7U0FDOUcsQ0FBQztLQUNMLENBQUM7MERBc0NEO0FBUUs7SUFOTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsd0JBQXdCO1FBQzlCLEtBQUssRUFBRSx5QkFBeUI7UUFDaEMsV0FBVyxFQUFFLGlHQUFpRztRQUM5RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQzt1REErQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuXG5leHBvcnQgY2xhc3MgU2VydmVyVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncXVlcnlfc2VydmVyX2lwX2xpc3QnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2VydmVyIElQIGxpc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIElQcyByZXBvcnRlZCBieSB0aGUgQ29jb3MgRWRpdG9yIHNlcnZlci4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHM7IHVzZSB0byBidWlsZCBjbGllbnQgY29ubmVjdGlvbiBVUkxzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeVNlcnZlcklQTGlzdCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpcExpc3Q6IHN0cmluZ1tdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2VydmVyJywgJ3F1ZXJ5LWlwLWxpc3QnKTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBpcExpc3Q6IGlwTGlzdCxcbiAgICAgICAgICAgICAgICBjb3VudDogaXBMaXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnSVAgbGlzdCByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncXVlcnlfc29ydGVkX3NlcnZlcl9pcF9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHNvcnRlZCBzZXJ2ZXIgSVBzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgRWRpdG9yIHNlcnZlciBJUCBsaXN0IGluIHByZWZlcnJlZCBvcmRlci4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5U29ydGVkU2VydmVySVBMaXN0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNvcnRlZElQTGlzdDogc3RyaW5nW10gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktc29ydC1pcC1saXN0Jyk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgc29ydGVkSVBMaXN0OiBzb3J0ZWRJUExpc3QsXG4gICAgICAgICAgICAgICAgY291bnQ6IHNvcnRlZElQTGlzdC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NvcnRlZCBJUCBsaXN0IHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV9zZXJ2ZXJfcG9ydCcsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzZXJ2ZXIgcG9ydCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgdGhlIGN1cnJlbnQgQ29jb3MgRWRpdG9yIHNlcnZlciBwb3J0LiBEb2VzIG5vdCBzdGFydCBvciBzdG9wIGFueSBzZXJ2ZXIuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5U2VydmVyUG9ydCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwb3J0OiBudW1iZXIgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzZXJ2ZXInLCAncXVlcnktcG9ydCcpO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHBvcnQ6IHBvcnQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEVkaXRvciBzZXJ2ZXIgaXMgcnVubmluZyBvbiBwb3J0ICR7cG9ydH1gXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfc2VydmVyX3N0YXR1cycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzZXJ2ZXIgc3RhdHVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29sbGVjdCBFZGl0b3Igc2VydmVyIElQL3BvcnQsIE1DUCBwb3J0LCBDb2NvcyB2ZXJzaW9uLCBwbGF0Zm9ybSwgYW5kIE5vZGUgcnVudGltZSBpbmZvLiBEaWFnbm9zdGljcyBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTZXJ2ZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIEdhdGhlciBjb21wcmVoZW5zaXZlIHNlcnZlciBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGNvbnN0IFtpcExpc3RSZXN1bHQsIHBvcnRSZXN1bHRdID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeVNlcnZlcklQTGlzdCgpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5U2VydmVyUG9ydCgpXG4gICAgICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXM6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIHNlcnZlclJ1bm5pbmc6IHRydWVcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgaWYgKGlwTGlzdFJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGlwTGlzdFJlc3VsdC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5hdmFpbGFibGVJUHMgPSBpcExpc3RSZXN1bHQudmFsdWUuZGF0YS5pcExpc3Q7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pcENvdW50ID0gaXBMaXN0UmVzdWx0LnZhbHVlLmRhdGEuY291bnQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmF2YWlsYWJsZUlQcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuaXBDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pcEVycm9yID0gaXBMaXN0UmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IGlwTGlzdFJlc3VsdC5yZWFzb24gOiBpcExpc3RSZXN1bHQudmFsdWUuZXJyb3I7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHBvcnRSZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBwb3J0UmVzdWx0LnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLnBvcnQgPSBwb3J0UmVzdWx0LnZhbHVlLmRhdGEucG9ydDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMucG9ydCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5wb3J0RXJyb3IgPSBwb3J0UmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IHBvcnRSZXN1bHQucmVhc29uIDogcG9ydFJlc3VsdC52YWx1ZS5lcnJvcjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgYWRkaXRpb25hbCBzZXJ2ZXIgaW5mb1xuICAgICAgICAgICAgICAgIHN0YXR1cy5tY3BTZXJ2ZXJQb3J0ID0gMzAwMDsgLy8gT3VyIE1DUCBzZXJ2ZXIgcG9ydFxuICAgICAgICAgICAgICAgIHN0YXR1cy5lZGl0b3JWZXJzaW9uID0gKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bic7XG4gICAgICAgICAgICAgICAgc3RhdHVzLnBsYXRmb3JtID0gcHJvY2Vzcy5wbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICBzdGF0dXMubm9kZVZlcnNpb24gPSBwcm9jZXNzLnZlcnNpb247XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHN0YXR1cykpO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIGdldCBzZXJ2ZXIgc3RhdHVzOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY2hlY2tfc2VydmVyX2Nvbm5lY3Rpdml0eScsXG4gICAgICAgIHRpdGxlOiAnQ2hlY2sgc2VydmVyIGNvbm5lY3Rpdml0eScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFByb2JlIEVkaXRvci5NZXNzYWdlIGNvbm5lY3Rpdml0eSB3aXRoIHNlcnZlci9xdWVyeS1wb3J0IGFuZCBhIHRpbWVvdXQuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB0aW1lb3V0OiB6Lm51bWJlcigpLmRlZmF1bHQoNTAwMCkuZGVzY3JpYmUoJ0VkaXRvciBzZXJ2ZXIgcmVzcG9uc2UgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuIERlZmF1bHQgNTAwMC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjaGVja1NlcnZlckNvbm5lY3Rpdml0eShhcmdzOiB7IHRpbWVvdXQ/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSBhcmdzLnRpbWVvdXQgPz8gNTAwMDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIFRlc3QgYmFzaWMgRWRpdG9yIEFQSSBjb25uZWN0aXZpdHlcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXN0UHJvbWlzZSA9IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NlcnZlcicsICdxdWVyeS1wb3J0Jyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZSgoXywgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignQ29ubmVjdGlvbiB0aW1lb3V0JykpLCB0aW1lb3V0KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGF3YWl0IFByb21pc2UucmFjZShbdGVzdFByb21pc2UsIHRpbWVvdXRQcm9taXNlXSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VUaW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbm5lY3RlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlVGltZTogcmVzcG9uc2VUaW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZW91dDogdGltZW91dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTZXJ2ZXIgY29ubmVjdGl2aXR5IGNvbmZpcm1lZCBpbiAke3Jlc3BvbnNlVGltZX1tc2BcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25uZWN0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VUaW1lOiByZXNwb25zZVRpbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aW1lb3V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X25ldHdvcmtfaW50ZXJmYWNlcycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBuZXR3b3JrIGludGVyZmFjZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIE9TIG5ldHdvcmsgaW50ZXJmYWNlcyBhbmQgY29tcGFyZSB3aXRoIEVkaXRvci1yZXBvcnRlZCBJUHMuIERpYWdub3N0aWNzIG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldE5ldHdvcmtJbnRlcmZhY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgbmV0d29yayBpbnRlcmZhY2VzIHVzaW5nIE5vZGUuanMgb3MgbW9kdWxlXG4gICAgICAgICAgICAgICAgY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGludGVyZmFjZXMgPSBvcy5uZXR3b3JrSW50ZXJmYWNlcygpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IG5ldHdvcmtJbmZvID0gT2JqZWN0LmVudHJpZXMoaW50ZXJmYWNlcykubWFwKChbbmFtZSwgYWRkcmVzc2VzXTogW3N0cmluZywgYW55XSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWRkcmVzc2VzOiBhZGRyZXNzZXMubWFwKChhZGRyOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRyZXNzOiBhZGRyLmFkZHJlc3MsXG4gICAgICAgICAgICAgICAgICAgICAgICBmYW1pbHk6IGFkZHIuZmFtaWx5LFxuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJuYWw6IGFkZHIuaW50ZXJuYWwsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaWRyOiBhZGRyLmNpZHJcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgICAgLy8gQWxzbyB0cnkgdG8gZ2V0IHNlcnZlciBJUHMgZm9yIGNvbXBhcmlzb25cbiAgICAgICAgICAgICAgICBjb25zdCBzZXJ2ZXJJUFJlc3VsdCA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2ZXJJUExpc3QoKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtJbnRlcmZhY2VzOiBuZXR3b3JrSW5mbyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlcnZlckF2YWlsYWJsZUlQczogc2VydmVySVBSZXN1bHQuc3VjY2VzcyA/IHNlcnZlcklQUmVzdWx0LmRhdGEuaXBMaXN0IDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTmV0d29yayBpbnRlcmZhY2VzIHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byBnZXQgbmV0d29yayBpbnRlcmZhY2VzOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19