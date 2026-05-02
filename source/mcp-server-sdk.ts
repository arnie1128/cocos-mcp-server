import * as http from 'http';
import * as url from 'url';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
    isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerSettings, ServerStatus, ToolDefinition } from './types';
import { setDebugLogEnabled, logger } from './lib/log';
import { setEditorContextEvalEnabled, setSceneLogCaptureEnabled } from './lib/runtime-flags';
import { ToolRegistry } from './tools/registry';
import { ResourceRegistry, createResourceRegistry } from './resources/registry';

const SERVER_NAME = 'cocos-mcp-server';
const SERVER_VERSION = '2.0.0';

// Idle session sweep: drop sessions that haven't been touched in this many ms.
// Set conservatively long for editor usage where a developer may pause work.
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;

interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    sdkServer: Server;
    lastActivityAt: number;
}

function jsonRpcError(code: number, message: string): string {
    return JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null });
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
    private tools: ToolRegistry;
    private resources: ResourceRegistry;
    private toolsList: ToolDefinition[] = [];
    private enabledTools: any[] = [];
    private cleanupInterval: NodeJS.Timeout | null = null;
    private updating: boolean = false;

    constructor(settings: MCPServerSettings, registry: ToolRegistry) {
        this.settings = settings;
        this.tools = registry;
        this.resources = createResourceRegistry(registry);
        setDebugLogEnabled(settings.enableDebugLog);
        setEditorContextEvalEnabled(settings.enableEditorContextEval ?? false);
        setSceneLogCaptureEnabled(settings.enableSceneLogCapture ?? true);
        logger.debug(`[MCPServer] Using shared tool registry (${Object.keys(registry).length} categories)`);
    }

    private buildSdkServer(): Server {
        const sdkServer = new Server(
            { name: SERVER_NAME, version: SERVER_VERSION },
            {
                capabilities: {
                    tools: { listChanged: true },
                    // T-P3-1: read-only state surface. subscribe stays false
                    // until T-P3-3 wires Cocos broadcast → resources/updated.
                    // RFC 6570 templates are implicitly supported by registering
                    // ListResourceTemplatesRequestSchema below — MCP spec has no
                    // resources.templates capability flag (cocos-cli's
                    // `templates: true` is non-spec and would be stripped).
                    resources: { listChanged: true, subscribe: false },
                },
            }
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
        sdkServer.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: this.resources.list(),
        }));
        sdkServer.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
            resourceTemplates: this.resources.listTemplates(),
        }));
        sdkServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const content = await this.resources.read(uri);
            return { contents: [content] };
        });
        return sdkServer;
    }

    // T-P1-5: ToolResponse → MCP CallToolResult. Failures carry the error
    // message in text content + isError. Successes keep JSON.stringify(result)
    // in text (back-compat) and the parsed object in structuredContent.
    private buildToolResult(result: any) {
        if (result && typeof result === 'object' && result.success === false) {
            const msg = result.error ?? result.message ?? 'Tool failed';
            return {
                content: [{ type: 'text' as const, text: typeof msg === 'string' ? msg : JSON.stringify(msg) }],
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

        const { port } = this.settings;
        logger.info(`[MCPServer] Starting HTTP server on port ${port}...`);
        this.httpServer = http.createServer(this.handleHttpRequest.bind(this));

        await new Promise<void>((resolve, reject) => {
            this.httpServer!.listen(port, '127.0.0.1', () => {
                logger.info(`[MCPServer] ✅ HTTP server started on http://127.0.0.1:${port}`);
                logger.info(`[MCPServer] Health check: http://127.0.0.1:${port}/health`);
                logger.info(`[MCPServer] MCP endpoint:  http://127.0.0.1:${port}/mcp`);
                resolve();
            });
            this.httpServer!.on('error', (err: NodeJS.ErrnoException) => {
                logger.error('[MCPServer] ❌ Failed to start server:', err);
                if (err.code === 'EADDRINUSE') {
                    logger.error(`[MCPServer] Port ${port} is already in use. Please change the port in settings.`);
                }
                reject(err);
            });
        });

        // setInterval keeps the Node event loop alive; unref so we don't
        // block extension teardown if stop() somehow doesn't run.
        this.cleanupInterval = setInterval(() => this.sweepIdleSessions(), SESSION_CLEANUP_INTERVAL_MS);
        this.cleanupInterval.unref?.();

        logger.info(`[MCPServer] 🚀 MCP Server ready (${this.toolsList.length} tools)`);
    }

    private sweepIdleSessions(): void {
        if (this.sessions.size === 0) return;
        const cutoff = Date.now() - SESSION_IDLE_TIMEOUT_MS;
        const stale: string[] = [];
        for (const [id, entry] of this.sessions) {
            if (entry.lastActivityAt < cutoff) stale.push(id);
        }
        for (const id of stale) {
            const entry = this.sessions.get(id);
            if (!entry) continue;
            this.sessions.delete(id);
            entry.transport.close().catch(err => {
                logger.warn(`[MCPServer] sweep close error for ${id}:`, err);
            });
            logger.debug(`[MCPServer] swept idle session: ${id} (remaining: ${this.sessions.size})`);
        }
    }

    private setupTools(): void {
        // Build the new list locally and only swap once it's ready, so that
        // a concurrent ListToolsRequest can never observe an empty list.
        const enabledFilter = this.enabledTools.length > 0
            ? new Set(this.enabledTools.map(t => `${t.category}_${t.name}`))
            : null;

        const next: ToolDefinition[] = [];
        for (const [category, toolSet] of Object.entries(this.tools)) {
            for (const tool of toolSet.getTools()) {
                const fqName = `${category}_${tool.name}`;
                if (enabledFilter && !enabledFilter.has(fqName)) continue;
                // T-V23-1: tag every non-primary tool [specialist] so AI prefers
                // execute_javascript for compound operations. The two execute_*
                // tools already carry their own [primary]/[compat] prefix in
                // their description text — leave those alone.
                const desc = tool.description;
                const alreadyTagged = desc.startsWith('[primary]') || desc.startsWith('[compat]') || desc.startsWith('[specialist]');
                next.push({
                    name: fqName,
                    description: alreadyTagged ? desc : `[specialist] ${desc}`,
                    inputSchema: tool.inputSchema,
                });
            }
        }
        this.toolsList = next;

        logger.debug(`[MCPServer] Setup tools: ${this.toolsList.length} tools available`);
    }

    public async executeToolCall(toolName: string, args: any): Promise<any> {
        const [category, ...rest] = toolName.split('_');
        const executor = this.tools[category];
        if (!executor) {
            throw new Error(`Tool ${toolName} not found`);
        }
        return executor.execute(rest.join('_'), args);
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

        // CORS is wildcard so the Cocos Creator panel webview (which loads
        // from a `file://` or `devtools://` origin) can hit this endpoint.
        // The server only listens on 127.0.0.1, so external attackers can't
        // reach it; the wildcard does mean any local web page in the user's
        // browser could probe it, which is acceptable for a developer tool.
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
            logger.error('[MCPServer] HTTP request error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error', details: error?.message }));
            }
        }
    }

    private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // GET (server-initiated SSE) and DELETE (explicit session close) both
        // require an existing session. Per Streamable HTTP spec, GET without
        // session is "method not allowed"; DELETE without session is "not found".
        if (req.method !== 'POST') {
            const entry = sessionId ? this.sessions.get(sessionId) : undefined;
            if (!entry) {
                const isGet = req.method === 'GET';
                res.writeHead(isGet ? 405 : 404, { 'Content-Type': 'application/json' });
                res.end(jsonRpcError(-32000, isGet
                    ? 'Method not allowed without active session'
                    : 'Session not found'));
                return;
            }
            entry.lastActivityAt = Date.now();
            await entry.transport.handleRequest(req, res);
            return;
        }

        // POST: read body once so we can detect initialize before dispatch.
        const body = await readBody(req);
        let parsedBody: any;
        if (body.length > 0) {
            try {
                parsedBody = JSON.parse(body);
            } catch (parseError: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(jsonRpcError(-32700,
                    `Parse error: ${parseError.message}. Body: ${body.substring(0, 200)}`));
                return;
            }
        }

        const existing = sessionId ? this.sessions.get(sessionId) : undefined;
        if (existing) {
            existing.lastActivityAt = Date.now();
            await existing.transport.handleRequest(req, res, parsedBody);
            return;
        }

        // New session must come with an initialize request.
        if (!isInitializeRequest(parsedBody)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(jsonRpcError(-32000, 'Bad Request: No valid session ID provided'));
            return;
        }

        // Build the Server first so the transport callback closure captures
        // an already-initialized binding (avoids TDZ-style ordering surprises).
        const sdkServer = this.buildSdkServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
                this.sessions.set(id, { transport, sdkServer, lastActivityAt: Date.now() });
                logger.debug(`[MCPServer] session initialized: ${id} (total: ${this.sessions.size})`);
            },
            onsessionclosed: (id) => {
                this.sessions.delete(id);
                logger.debug(`[MCPServer] session closed: ${id} (remaining: ${this.sessions.size})`);
            },
        });
        await sdkServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
    }

    public async stop(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        for (const { transport } of this.sessions.values()) {
            try {
                await transport.close();
            } catch (e) {
                logger.warn('[MCPServer] transport close error:', e);
            }
        }
        this.sessions.clear();
        if (this.httpServer) {
            // close() only refuses NEW connections; keep-alive sockets stay
            // open and would block close() forever. Force them to drop too.
            this.httpServer.closeAllConnections?.();
            await new Promise<void>(resolve => {
                this.httpServer!.close(() => resolve());
            });
            this.httpServer = null;
            logger.info('[MCPServer] HTTP server stopped');
        }
    }

    public getStatus(): ServerStatus {
        return {
            running: !!this.httpServer,
            port: this.settings.port,
            clients: this.sessions.size,
        };
    }

    private async handleSimpleAPIRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
        const pathParts = pathname.split('/').filter(p => p);
        if (pathParts.length < 3) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid API path. Use /api/{category}/{tool_name}' }));
            return;
        }
        const fullToolName = `${pathParts[1]}_${pathParts[2]}`;

        const body = await readBody(req);
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

        try {
            const result = await this.executeToolCall(fullToolName, params);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tool: fullToolName, result }));
        } catch (error: any) {
            logger.error('[MCPServer] Simple API error:', error);
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
        if (this.updating) {
            logger.warn('[MCPServer] updateSettings ignored — another update in progress');
            return;
        }
        this.updating = true;
        try {
            this.settings = settings;
            setDebugLogEnabled(settings.enableDebugLog);
            // v2.3.1 review fix: panel toggles for enableEditorContextEval must
            // take effect immediately. Without this re-apply, disabling the
            // setting after enable would leave the runtime flag ON until the
            // entire extension reloads — a security-relevant gap because the
            // editor-context eval would keep accepting AI-generated host-side
            // code despite the user's panel choice.
            setEditorContextEvalEnabled(settings.enableEditorContextEval ?? false);
            // v2.4.8 A3: re-apply scene-log-capture flag on every settings
            // change so panel toggle takes effect immediately, mirroring the
            // editorContextEval re-apply pattern.
            setSceneLogCaptureEnabled(settings.enableSceneLogCapture ?? true);
            if (this.httpServer) {
                await this.stop();
                await this.start();
            }
        } finally {
            this.updating = false;
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
