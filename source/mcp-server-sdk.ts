import * as http from 'http';
import * as url from 'url';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerSettings, ServerStatus, MCPClient, ToolDefinition } from './types';
import { setDebugLogEnabled, logger } from './lib/log';
import { ToolRegistry } from './tools/registry';

const SERVER_NAME = 'cocos-mcp-server';
const SERVER_VERSION = '2.0.0';

interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    sdkServer: Server;
}

/**
 * MCP server backed by the official @modelcontextprotocol/sdk Server +
 * StreamableHTTPServerTransport (stateful mode).
 *
 * Each MCP client gets its own Server + Transport pair keyed by
 * `mcp-session-id`. Initialize requests with no session id mint a new pair.
 * REST endpoints (/health, /api/tools, /api/{cat}/{tool}) share the same
 * underlying http.Server.
 */
export class MCPServer {
    private settings: MCPServerSettings;
    private httpServer: http.Server | null = null;
    private sessions: Map<string, SessionEntry> = new Map();
    private clients: Map<string, MCPClient> = new Map();
    private tools: ToolRegistry;
    private toolsList: ToolDefinition[] = [];
    private enabledTools: any[] = [];

    constructor(settings: MCPServerSettings, registry: ToolRegistry) {
        this.settings = settings;
        this.tools = registry;
        setDebugLogEnabled(settings.enableDebugLog);
        logger.debug(`[MCPServer] Using shared tool registry (${Object.keys(registry).length} categories)`);
    }

    private buildSdkServer(): Server {
        const sdkServer = new Server(
            { name: SERVER_NAME, version: SERVER_VERSION },
            { capabilities: { tools: { listChanged: true } } }
        );
        sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: this.toolsList.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        }));
        sdkServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                const result = await this.executeToolCall(name, args ?? {});
                return this.buildToolResult(result);
            } catch (err: any) {
                return {
                    content: [{ type: 'text' as const, text: err?.message ?? String(err) }],
                    isError: true,
                };
            }
        });
        return sdkServer;
    }

    /**
     * Convert ToolResponse → MCP CallToolResult with structured content (T-P1-5).
     * - success === false → isError:true, text content carries the error message
     * - success === true  → text content carries JSON.stringify(result) (back-compat),
     *                       structuredContent carries the parsed object
     */
    private buildToolResult(result: any): { content: Array<{ type: 'text'; text: string }>; structuredContent?: any; isError?: boolean } {
        if (result && typeof result === 'object' && result.success === false) {
            const msg = result.error ?? result.message ?? 'Tool failed';
            return {
                content: [{ type: 'text', text: typeof msg === 'string' ? msg : JSON.stringify(msg) }],
                isError: true,
            };
        }
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        const out: { content: Array<{ type: 'text'; text: string }>; structuredContent?: any } = {
            content: [{ type: 'text', text }],
        };
        if (result && typeof result === 'object') {
            out.structuredContent = result;
        }
        return out;
    }

    public async start(): Promise<void> {
        if (this.httpServer) {
            logger.debug('[MCPServer] Server is already running');
            return;
        }

        this.setupTools();

        try {
            logger.info(`[MCPServer] Starting HTTP server on port ${this.settings.port}...`);
            this.httpServer = http.createServer(this.handleHttpRequest.bind(this));

            await new Promise<void>((resolve, reject) => {
                this.httpServer!.listen(this.settings.port, '127.0.0.1', () => {
                    logger.info(`[MCPServer] ✅ HTTP server started on http://127.0.0.1:${this.settings.port}`);
                    logger.info(`[MCPServer] Health check: http://127.0.0.1:${this.settings.port}/health`);
                    logger.info(`[MCPServer] MCP endpoint:  http://127.0.0.1:${this.settings.port}/mcp`);
                    resolve();
                });
                this.httpServer!.on('error', (err: any) => {
                    logger.error('[MCPServer] ❌ Failed to start server:', err);
                    if (err.code === 'EADDRINUSE') {
                        logger.error(`[MCPServer] Port ${this.settings.port} is already in use. Please change the port in settings.`);
                    }
                    reject(err);
                });
            });

            logger.info(`[MCPServer] 🚀 MCP Server ready (${this.toolsList.length} tools)`);
        } catch (error) {
            logger.error('[MCPServer] ❌ Failed to start server:', error);
            throw error;
        }
    }

    private setupTools(): void {
        this.toolsList = [];

        if (!this.enabledTools || this.enabledTools.length === 0) {
            for (const [category, toolSet] of Object.entries(this.tools)) {
                for (const tool of toolSet.getTools()) {
                    this.toolsList.push({
                        name: `${category}_${tool.name}`,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    });
                }
            }
        } else {
            const enabledToolNames = new Set(this.enabledTools.map(t => `${t.category}_${t.name}`));
            for (const [category, toolSet] of Object.entries(this.tools)) {
                for (const tool of toolSet.getTools()) {
                    const fqName = `${category}_${tool.name}`;
                    if (enabledToolNames.has(fqName)) {
                        this.toolsList.push({
                            name: fqName,
                            description: tool.description,
                            inputSchema: tool.inputSchema,
                        });
                    }
                }
            }
        }

        logger.debug(`[MCPServer] Setup tools: ${this.toolsList.length} tools available`);
    }

    public getFilteredTools(enabledTools: any[]): ToolDefinition[] {
        if (!enabledTools || enabledTools.length === 0) {
            return this.toolsList;
        }
        const enabledToolNames = new Set(enabledTools.map(t => `${t.category}_${t.name}`));
        return this.toolsList.filter(t => enabledToolNames.has(t.name));
    }

    public async executeToolCall(toolName: string, args: any): Promise<any> {
        const parts = toolName.split('_');
        const category = parts[0];
        const toolMethodName = parts.slice(1).join('_');

        if (this.tools[category]) {
            return await this.tools[category].execute(toolMethodName, args);
        }
        throw new Error(`Tool ${toolName} not found`);
    }

    public getClients(): MCPClient[] {
        return Array.from(this.clients.values());
    }

    public getAvailableTools(): ToolDefinition[] {
        return this.toolsList;
    }

    public updateEnabledTools(enabledTools: any[]): void {
        logger.debug(`[MCPServer] Updating enabled tools: ${enabledTools.length} tools`);
        this.enabledTools = enabledTools;
        this.setupTools();
        // Notify all live sessions that the tool list changed.
        for (const { sdkServer } of this.sessions.values()) {
            sdkServer.sendToolListChanged().catch(() => { /* peer may have dropped */ });
        }
    }

    public getSettings(): MCPServerSettings {
        return this.settings;
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const parsedUrl = url.parse(req.url || '', true);
        const pathname = parsedUrl.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            if (pathname === '/mcp') {
                await this.handleMcpRequest(req, res);
                return;
            }
            if (pathname === '/health' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', tools: this.toolsList.length }));
                return;
            }
            if (pathname === '/api/tools' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tools: this.getSimplifiedToolsList() }));
                return;
            }
            if (pathname?.startsWith('/api/') && req.method === 'POST') {
                await this.handleSimpleAPIRequest(req, res, pathname);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error: any) {
            logger.error('HTTP request error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error', details: error?.message }));
            }
        }
    }

    private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // GET / DELETE require an existing session — route directly.
        if (req.method !== 'POST') {
            if (!sessionId || !this.sessions.has(sessionId)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'No active session for this request' },
                    id: null,
                }));
                return;
            }
            await this.sessions.get(sessionId)!.transport.handleRequest(req, res);
            return;
        }

        // POST: read body once so we can detect initialize before dispatch.
        const body = await readBody(req);
        let parsedBody: any = undefined;
        if (body.length > 0) {
            try {
                parsedBody = JSON.parse(body);
            } catch (parseError: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32700,
                        message: `Parse error: ${parseError.message}. Body: ${body.substring(0, 200)}`,
                    },
                    id: null,
                }));
                return;
            }
        }

        // Existing session?
        if (sessionId && this.sessions.has(sessionId)) {
            await this.sessions.get(sessionId)!.transport.handleRequest(req, res, parsedBody);
            return;
        }

        // New session must come with an initialize request.
        if (!isInitializeRequest(parsedBody)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                id: null,
            }));
            return;
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
                this.sessions.set(id, { transport, sdkServer });
                logger.debug(`[MCPServer] session initialized: ${id} (total: ${this.sessions.size})`);
            },
            onsessionclosed: (id) => {
                this.sessions.delete(id);
                logger.debug(`[MCPServer] session closed: ${id} (remaining: ${this.sessions.size})`);
            },
        });
        transport.onclose = () => {
            const id = transport.sessionId;
            if (id) {
                this.sessions.delete(id);
            }
        };
        const sdkServer = this.buildSdkServer();
        await sdkServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
    }

    public async stop(): Promise<void> {
        for (const { transport } of this.sessions.values()) {
            try {
                await transport.close();
            } catch (e) {
                logger.warn('[MCPServer] transport close error:', e);
            }
        }
        this.sessions.clear();
        if (this.httpServer) {
            await new Promise<void>(resolve => {
                this.httpServer!.close(() => resolve());
            });
            this.httpServer = null;
            logger.info('[MCPServer] HTTP server stopped');
        }
        this.clients.clear();
    }

    public getStatus(): ServerStatus {
        return {
            running: !!this.httpServer,
            port: this.settings.port,
            clients: this.sessions.size,
        };
    }

    private async handleSimpleAPIRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
        const body = await readBody(req);
        try {
            const pathParts = pathname.split('/').filter(p => p);
            if (pathParts.length < 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid API path. Use /api/{category}/{tool_name}' }));
                return;
            }
            const category = pathParts[1];
            const toolName = pathParts[2];
            const fullToolName = `${category}_${toolName}`;

            let params: any;
            try {
                params = body ? JSON.parse(body) : {};
            } catch (parseError: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Invalid JSON in request body',
                    details: parseError.message,
                    receivedBody: body.substring(0, 200),
                }));
                return;
            }

            const result = await this.executeToolCall(fullToolName, params);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tool: fullToolName, result }));
        } catch (error: any) {
            logger.error('Simple API error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message, tool: pathname }));
            }
        }
    }

    private getSimplifiedToolsList(): any[] {
        return this.toolsList.map(tool => {
            const parts = tool.name.split('_');
            const category = parts[0];
            const toolName = parts.slice(1).join('_');
            return {
                name: tool.name,
                category,
                toolName,
                description: tool.description,
                apiPath: `/api/${category}/${toolName}`,
                curlExample: this.generateCurlExample(category, toolName, tool.inputSchema),
            };
        });
    }

    private generateCurlExample(category: string, toolName: string, schema: any): string {
        const sampleParams = this.generateSampleParams(schema);
        const jsonString = JSON.stringify(sampleParams, null, 2);
        return `curl -X POST http://127.0.0.1:${this.settings.port}/api/${category}/${toolName} \\
  -H "Content-Type: application/json" \\
  -d '${jsonString}'`;
    }

    private generateSampleParams(schema: any): any {
        if (!schema || !schema.properties) return {};
        const sample: any = {};
        for (const [key, prop] of Object.entries(schema.properties as any)) {
            const propSchema = prop as any;
            switch (propSchema.type) {
                case 'string':
                    sample[key] = propSchema.default ?? 'example_string';
                    break;
                case 'number':
                    sample[key] = propSchema.default ?? 42;
                    break;
                case 'boolean':
                    sample[key] = propSchema.default ?? true;
                    break;
                case 'object':
                    sample[key] = propSchema.default ?? { x: 0, y: 0, z: 0 };
                    break;
                default:
                    sample[key] = 'example_value';
            }
        }
        return sample;
    }

    public async updateSettings(settings: MCPServerSettings): Promise<void> {
        this.settings = settings;
        setDebugLogEnabled(settings.enableDebugLog);
        if (this.httpServer) {
            await this.stop();
            await this.start();
        }
    }
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
