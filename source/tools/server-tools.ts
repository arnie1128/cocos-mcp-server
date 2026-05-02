import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class ServerTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'query_server_ip_list',
                title: 'Read server IP list',
                description: 'Read IPs reported by the Cocos Editor server. No project side effects; use to build client connection URLs.',
                inputSchema: z.object({}),
                handler: () => this.queryServerIPList(),
            },
            {
                name: 'query_sorted_server_ip_list',
                title: 'Read sorted server IPs',
                description: 'Read the Editor server IP list in preferred order. No project side effects.',
                inputSchema: z.object({}),
                handler: () => this.querySortedServerIPList(),
            },
            {
                name: 'query_server_port',
                title: 'Read server port',
                description: 'Read the current Cocos Editor server port. Does not start or stop any server.',
                inputSchema: z.object({}),
                handler: () => this.queryServerPort(),
            },
            {
                name: 'get_server_status',
                title: 'Read server status',
                description: 'Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info. Diagnostics only.',
                inputSchema: z.object({}),
                handler: () => this.getServerStatus(),
            },
            {
                name: 'check_server_connectivity',
                title: 'Check server connectivity',
                description: 'Probe Editor.Message connectivity with server/query-port and a timeout. No project side effects.',
                inputSchema: z.object({
                    timeout: z.number().default(5000).describe('Editor server response timeout in milliseconds. Default 5000.'),
                }),
                handler: a => this.checkServerConnectivity(a.timeout),
            },
            {
                name: 'get_network_interfaces',
                title: 'Read network interfaces',
                description: 'Read OS network interfaces and compare with Editor-reported IPs. Diagnostics only.',
                inputSchema: z.object({}),
                handler: () => this.getNetworkInterfaces(),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async queryServerIPList(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('server', 'query-ip-list').then((ipList: string[]) => {
                resolve(ok({
                        ipList: ipList,
                        count: ipList.length,
                        message: 'IP list retrieved successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async querySortedServerIPList(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('server', 'query-sort-ip-list').then((sortedIPList: string[]) => {
                resolve(ok({
                        sortedIPList: sortedIPList,
                        count: sortedIPList.length,
                        message: 'Sorted IP list retrieved successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryServerPort(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('server', 'query-port').then((port: number) => {
                resolve(ok({
                        port: port,
                        message: `Editor server is running on port ${port}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async getServerStatus(): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // Gather comprehensive server information
                const [ipListResult, portResult] = await Promise.allSettled([
                    this.queryServerIPList(),
                    this.queryServerPort()
                ]);

                const status: any = {
                    timestamp: new Date().toISOString(),
                    serverRunning: true
                };

                if (ipListResult.status === 'fulfilled' && ipListResult.value.success) {
                    status.availableIPs = ipListResult.value.data.ipList;
                    status.ipCount = ipListResult.value.data.count;
                } else {
                    status.availableIPs = [];
                    status.ipCount = 0;
                    status.ipError = ipListResult.status === 'rejected' ? ipListResult.reason : ipListResult.value.error;
                }

                if (portResult.status === 'fulfilled' && portResult.value.success) {
                    status.port = portResult.value.data.port;
                } else {
                    status.port = null;
                    status.portError = portResult.status === 'rejected' ? portResult.reason : portResult.value.error;
                }

                // Add additional server info
                status.mcpServerPort = 3000; // Our MCP server port
                status.editorVersion = (Editor as any).versions?.cocos || 'Unknown';
                status.platform = process.platform;
                status.nodeVersion = process.version;

                resolve(ok(status));

            } catch (err: any) {
                resolve(fail(`Failed to get server status: ${err.message}`));
            }
        });
    }

    private async checkServerConnectivity(timeout: number = 5000): Promise<ToolResponse> {
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
                
                resolve(ok({
                        connected: true,
                        responseTime: responseTime,
                        timeout: timeout,
                        message: `Server connectivity confirmed in ${responseTime}ms`
                    }));

            } catch (err: any) {
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

    private async getNetworkInterfaces(): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // Get network interfaces using Node.js os module
                const os = require('os');
                const interfaces = os.networkInterfaces();
                
                const networkInfo = Object.entries(interfaces).map(([name, addresses]: [string, any]) => ({
                    name: name,
                    addresses: addresses.map((addr: any) => ({
                        address: addr.address,
                        family: addr.family,
                        internal: addr.internal,
                        cidr: addr.cidr
                    }))
                }));

                // Also try to get server IPs for comparison
                const serverIPResult = await this.queryServerIPList();
                
                resolve(ok({
                        networkInterfaces: networkInfo,
                        serverAvailableIPs: serverIPResult.success ? serverIPResult.data.ipList : [],
                        message: 'Network interfaces retrieved successfully'
                    }));

            } catch (err: any) {
                resolve(fail(`Failed to get network interfaces: ${err.message}`));
            }
        });
    }
}
