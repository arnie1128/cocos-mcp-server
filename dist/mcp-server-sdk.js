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
exports.MCPServer = void 0;
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const crypto_1 = require("crypto");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const log_1 = require("./lib/log");
const SERVER_NAME = 'cocos-mcp-server';
const SERVER_VERSION = '2.0.0';
// Idle session sweep: drop sessions that haven't been touched in this many ms.
// Set conservatively long for editor usage where a developer may pause work.
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
function jsonRpcError(code, message) {
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
class MCPServer {
    constructor(settings, registry) {
        this.httpServer = null;
        this.sessions = new Map();
        this.toolsList = [];
        this.enabledTools = [];
        this.cleanupInterval = null;
        this.updating = false;
        this.settings = settings;
        this.tools = registry;
        (0, log_1.setDebugLogEnabled)(settings.enableDebugLog);
        log_1.logger.debug(`[MCPServer] Using shared tool registry (${Object.keys(registry).length} categories)`);
    }
    buildSdkServer() {
        const sdkServer = new index_js_1.Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: { listChanged: true } } });
        sdkServer.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
            tools: this.toolsList.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        }));
        sdkServer.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            var _a;
            const { name, arguments: args } = request.params;
            try {
                const result = await this.executeToolCall(name, args !== null && args !== void 0 ? args : {});
                return this.buildToolResult(result);
            }
            catch (err) {
                return {
                    content: [{ type: 'text', text: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) }],
                    isError: true,
                };
            }
        });
        return sdkServer;
    }
    // T-P1-5: ToolResponse → MCP CallToolResult. Failures carry the error
    // message in text content + isError. Successes keep JSON.stringify(result)
    // in text (back-compat) and the parsed object in structuredContent.
    buildToolResult(result) {
        var _a, _b;
        if (result && typeof result === 'object' && result.success === false) {
            const msg = (_b = (_a = result.error) !== null && _a !== void 0 ? _a : result.message) !== null && _b !== void 0 ? _b : 'Tool failed';
            return {
                content: [{ type: 'text', text: typeof msg === 'string' ? msg : JSON.stringify(msg) }],
                isError: true,
            };
        }
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        const out = {
            content: [{ type: 'text', text }],
        };
        if (result && typeof result === 'object') {
            out.structuredContent = result;
        }
        return out;
    }
    async start() {
        var _a, _b;
        if (this.httpServer) {
            log_1.logger.debug('[MCPServer] Server is already running');
            return;
        }
        this.setupTools();
        const { port } = this.settings;
        log_1.logger.info(`[MCPServer] Starting HTTP server on port ${port}...`);
        this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
        await new Promise((resolve, reject) => {
            this.httpServer.listen(port, '127.0.0.1', () => {
                log_1.logger.info(`[MCPServer] ✅ HTTP server started on http://127.0.0.1:${port}`);
                log_1.logger.info(`[MCPServer] Health check: http://127.0.0.1:${port}/health`);
                log_1.logger.info(`[MCPServer] MCP endpoint:  http://127.0.0.1:${port}/mcp`);
                resolve();
            });
            this.httpServer.on('error', (err) => {
                log_1.logger.error('[MCPServer] ❌ Failed to start server:', err);
                if (err.code === 'EADDRINUSE') {
                    log_1.logger.error(`[MCPServer] Port ${port} is already in use. Please change the port in settings.`);
                }
                reject(err);
            });
        });
        // setInterval keeps the Node event loop alive; unref so we don't
        // block extension teardown if stop() somehow doesn't run.
        this.cleanupInterval = setInterval(() => this.sweepIdleSessions(), SESSION_CLEANUP_INTERVAL_MS);
        (_b = (_a = this.cleanupInterval).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
        log_1.logger.info(`[MCPServer] 🚀 MCP Server ready (${this.toolsList.length} tools)`);
    }
    sweepIdleSessions() {
        if (this.sessions.size === 0)
            return;
        const cutoff = Date.now() - SESSION_IDLE_TIMEOUT_MS;
        const stale = [];
        for (const [id, entry] of this.sessions) {
            if (entry.lastActivityAt < cutoff)
                stale.push(id);
        }
        for (const id of stale) {
            const entry = this.sessions.get(id);
            if (!entry)
                continue;
            this.sessions.delete(id);
            entry.transport.close().catch(err => {
                log_1.logger.warn(`[MCPServer] sweep close error for ${id}:`, err);
            });
            log_1.logger.debug(`[MCPServer] swept idle session: ${id} (remaining: ${this.sessions.size})`);
        }
    }
    setupTools() {
        // Build the new list locally and only swap once it's ready, so that
        // a concurrent ListToolsRequest can never observe an empty list.
        const enabledFilter = this.enabledTools.length > 0
            ? new Set(this.enabledTools.map(t => `${t.category}_${t.name}`))
            : null;
        const next = [];
        for (const [category, toolSet] of Object.entries(this.tools)) {
            for (const tool of toolSet.getTools()) {
                const fqName = `${category}_${tool.name}`;
                if (enabledFilter && !enabledFilter.has(fqName))
                    continue;
                next.push({
                    name: fqName,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                });
            }
        }
        this.toolsList = next;
        log_1.logger.debug(`[MCPServer] Setup tools: ${this.toolsList.length} tools available`);
    }
    getFilteredTools(enabledTools) {
        if (!enabledTools || enabledTools.length === 0) {
            return this.toolsList;
        }
        const enabledToolNames = new Set(enabledTools.map(t => `${t.category}_${t.name}`));
        return this.toolsList.filter(t => enabledToolNames.has(t.name));
    }
    async executeToolCall(toolName, args) {
        const [category, ...rest] = toolName.split('_');
        const executor = this.tools[category];
        if (!executor) {
            throw new Error(`Tool ${toolName} not found`);
        }
        return executor.execute(rest.join('_'), args);
    }
    getAvailableTools() {
        return this.toolsList;
    }
    updateEnabledTools(enabledTools) {
        log_1.logger.debug(`[MCPServer] Updating enabled tools: ${enabledTools.length} tools`);
        this.enabledTools = enabledTools;
        this.setupTools();
        // Notify all live sessions that the tool list changed.
        for (const { sdkServer } of this.sessions.values()) {
            sdkServer.sendToolListChanged().catch(() => { });
        }
    }
    getSettings() {
        return this.settings;
    }
    async handleHttpRequest(req, res) {
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
            if ((pathname === null || pathname === void 0 ? void 0 : pathname.startsWith('/api/')) && req.method === 'POST') {
                await this.handleSimpleAPIRequest(req, res, pathname);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
        catch (error) {
            log_1.logger.error('[MCPServer] HTTP request error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error', details: error === null || error === void 0 ? void 0 : error.message }));
            }
        }
    }
    async handleMcpRequest(req, res) {
        const sessionId = req.headers['mcp-session-id'];
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
        let parsedBody;
        if (body.length > 0) {
            try {
                parsedBody = JSON.parse(body);
            }
            catch (parseError) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(jsonRpcError(-32700, `Parse error: ${parseError.message}. Body: ${body.substring(0, 200)}`));
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
        if (!(0, types_js_1.isInitializeRequest)(parsedBody)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(jsonRpcError(-32000, 'Bad Request: No valid session ID provided'));
            return;
        }
        // Build the Server first so the transport callback closure captures
        // an already-initialized binding (avoids TDZ-style ordering surprises).
        const sdkServer = this.buildSdkServer();
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: () => (0, crypto_1.randomUUID)(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
                this.sessions.set(id, { transport, sdkServer, lastActivityAt: Date.now() });
                log_1.logger.debug(`[MCPServer] session initialized: ${id} (total: ${this.sessions.size})`);
            },
            onsessionclosed: (id) => {
                this.sessions.delete(id);
                log_1.logger.debug(`[MCPServer] session closed: ${id} (remaining: ${this.sessions.size})`);
            },
        });
        await sdkServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
    }
    async stop() {
        var _a, _b;
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        for (const { transport } of this.sessions.values()) {
            try {
                await transport.close();
            }
            catch (e) {
                log_1.logger.warn('[MCPServer] transport close error:', e);
            }
        }
        this.sessions.clear();
        if (this.httpServer) {
            // close() only refuses NEW connections; keep-alive sockets stay
            // open and would block close() forever. Force them to drop too.
            (_b = (_a = this.httpServer).closeAllConnections) === null || _b === void 0 ? void 0 : _b.call(_a);
            await new Promise(resolve => {
                this.httpServer.close(() => resolve());
            });
            this.httpServer = null;
            log_1.logger.info('[MCPServer] HTTP server stopped');
        }
    }
    getStatus() {
        return {
            running: !!this.httpServer,
            port: this.settings.port,
            clients: this.sessions.size,
        };
    }
    async handleSimpleAPIRequest(req, res, pathname) {
        const pathParts = pathname.split('/').filter(p => p);
        if (pathParts.length < 3) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid API path. Use /api/{category}/{tool_name}' }));
            return;
        }
        const fullToolName = `${pathParts[1]}_${pathParts[2]}`;
        const body = await readBody(req);
        let params;
        try {
            params = body ? JSON.parse(body) : {};
        }
        catch (parseError) {
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
        }
        catch (error) {
            log_1.logger.error('[MCPServer] Simple API error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message, tool: pathname }));
            }
        }
    }
    getSimplifiedToolsList() {
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
    generateCurlExample(category, toolName, schema) {
        const sampleParams = this.generateSampleParams(schema);
        const jsonString = JSON.stringify(sampleParams, null, 2);
        return `curl -X POST http://127.0.0.1:${this.settings.port}/api/${category}/${toolName} \\
  -H "Content-Type: application/json" \\
  -d '${jsonString}'`;
    }
    generateSampleParams(schema) {
        var _a, _b, _c, _d;
        if (!schema || !schema.properties)
            return {};
        const sample = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            const propSchema = prop;
            switch (propSchema.type) {
                case 'string':
                    sample[key] = (_a = propSchema.default) !== null && _a !== void 0 ? _a : 'example_string';
                    break;
                case 'number':
                    sample[key] = (_b = propSchema.default) !== null && _b !== void 0 ? _b : 42;
                    break;
                case 'boolean':
                    sample[key] = (_c = propSchema.default) !== null && _c !== void 0 ? _c : true;
                    break;
                case 'object':
                    sample[key] = (_d = propSchema.default) !== null && _d !== void 0 ? _d : { x: 0, y: 0, z: 0 };
                    break;
                default:
                    sample[key] = 'example_value';
            }
        }
        return sample;
    }
    async updateSettings(settings) {
        if (this.updating) {
            log_1.logger.warn('[MCPServer] updateSettings ignored — another update in progress');
            return;
        }
        this.updating = true;
        try {
            this.settings = settings;
            (0, log_1.setDebugLogEnabled)(settings.enableDebugLog);
            if (this.httpServer) {
                await this.stop();
                await this.start();
            }
        }
        finally {
            this.updating = false;
        }
    }
}
exports.MCPServer = MCPServer;
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFJNEM7QUFFNUMsbUNBQXVEO0FBR3ZELE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDO0FBQ3ZDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBUTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQVVsQixZQUFZLFFBQTJCLEVBQUUsUUFBc0I7UUFSdkQsZUFBVSxHQUF1QixJQUFJLENBQUM7UUFDdEMsYUFBUSxHQUE4QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWhELGNBQVMsR0FBcUIsRUFBRSxDQUFDO1FBQ2pDLGlCQUFZLEdBQVUsRUFBRSxDQUFDO1FBQ3pCLG9CQUFlLEdBQTBCLElBQUksQ0FBQztRQUM5QyxhQUFRLEdBQVksS0FBSyxDQUFDO1FBRzlCLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1FBQ3RCLElBQUEsd0JBQWtCLEVBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzVDLFlBQU0sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxjQUFjLENBQUMsQ0FBQztJQUN4RyxDQUFDO0lBRU8sY0FBYztRQUNsQixNQUFNLFNBQVMsR0FBRyxJQUFJLGlCQUFNLENBQ3hCLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQzlDLEVBQUUsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FDckQsQ0FBQztRQUNGLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxpQ0FBc0IsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7WUFDN0QsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO2dCQUNaLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVztnQkFDMUIsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXO2FBQzdCLENBQUMsQ0FBQztTQUNOLENBQUMsQ0FBQyxDQUFDO1FBQ0osU0FBUyxDQUFDLGlCQUFpQixDQUFDLGdDQUFxQixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTs7WUFDakUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztZQUNqRCxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLGFBQUosSUFBSSxjQUFKLElBQUksR0FBSSxFQUFFLENBQUMsQ0FBQztnQkFDNUQsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO2dCQUNoQixPQUFPO29CQUNILE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQWUsRUFBRSxJQUFJLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDdkUsT0FBTyxFQUFFLElBQUk7aUJBQ2hCLENBQUM7WUFDTixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFNBQVMsQ0FBQztJQUNyQixDQUFDO0lBRUQsc0VBQXNFO0lBQ3RFLDJFQUEyRTtJQUMzRSxvRUFBb0U7SUFDNUQsZUFBZSxDQUFDLE1BQVc7O1FBQy9CLElBQUksTUFBTSxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ25FLE1BQU0sR0FBRyxHQUFHLE1BQUEsTUFBQSxNQUFNLENBQUMsS0FBSyxtQ0FBSSxNQUFNLENBQUMsT0FBTyxtQ0FBSSxhQUFhLENBQUM7WUFDNUQsT0FBTztnQkFDSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFlLEVBQUUsSUFBSSxFQUFFLE9BQU8sR0FBRyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQy9GLE9BQU8sRUFBRSxJQUFJO2FBQ2hCLENBQUM7UUFDTixDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDMUUsTUFBTSxHQUFHLEdBQWdGO1lBQ3JGLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUNwQyxDQUFDO1FBQ0YsSUFBSSxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdkMsR0FBRyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDZixDQUFDO0lBRU0sS0FBSyxDQUFDLEtBQUs7O1FBQ2QsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEIsWUFBTSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1lBQ3RELE9BQU87UUFDWCxDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRWxCLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQy9CLFlBQU0sQ0FBQyxJQUFJLENBQUMsNENBQTRDLElBQUksS0FBSyxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV2RSxNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3hDLElBQUksQ0FBQyxVQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFO2dCQUM1QyxZQUFNLENBQUMsSUFBSSxDQUFDLHlEQUF5RCxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RSxZQUFNLENBQUMsSUFBSSxDQUFDLDhDQUE4QyxJQUFJLFNBQVMsQ0FBQyxDQUFDO2dCQUN6RSxZQUFNLENBQUMsSUFBSSxDQUFDLCtDQUErQyxJQUFJLE1BQU0sQ0FBQyxDQUFDO2dCQUN2RSxPQUFPLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLFVBQVcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBMEIsRUFBRSxFQUFFO2dCQUN4RCxZQUFNLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUMzRCxJQUFJLEdBQUcsQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7b0JBQzVCLFlBQU0sQ0FBQyxLQUFLLENBQUMsb0JBQW9CLElBQUkseURBQXlELENBQUMsQ0FBQztnQkFDcEcsQ0FBQztnQkFDRCxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztRQUVILGlFQUFpRTtRQUNqRSwwREFBMEQ7UUFDMUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUNoRyxNQUFBLE1BQUEsSUFBSSxDQUFDLGVBQWUsRUFBQyxLQUFLLGtEQUFJLENBQUM7UUFFL0IsWUFBTSxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0lBQ3BGLENBQUM7SUFFTyxpQkFBaUI7UUFDckIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDO1lBQUUsT0FBTztRQUNyQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsdUJBQXVCLENBQUM7UUFDcEQsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO1FBQzNCLEtBQUssTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDdEMsSUFBSSxLQUFLLENBQUMsY0FBYyxHQUFHLE1BQU07Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsS0FBSyxNQUFNLEVBQUUsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNyQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwQyxJQUFJLENBQUMsS0FBSztnQkFBRSxTQUFTO1lBQ3JCLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3pCLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUNoQyxZQUFNLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNqRSxDQUFDLENBQUMsQ0FBQztZQUNILFlBQU0sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsZ0JBQWdCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUM3RixDQUFDO0lBQ0wsQ0FBQztJQUVPLFVBQVU7UUFDZCxvRUFBb0U7UUFDcEUsaUVBQWlFO1FBQ2pFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDOUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFFWCxNQUFNLElBQUksR0FBcUIsRUFBRSxDQUFDO1FBQ2xDLEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNELEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sTUFBTSxHQUFHLEdBQUcsUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUMsSUFBSSxhQUFhLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztvQkFBRSxTQUFTO2dCQUMxRCxJQUFJLENBQUMsSUFBSSxDQUFDO29CQUNOLElBQUksRUFBRSxNQUFNO29CQUNaLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztvQkFDN0IsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO2lCQUNoQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBRXRCLFlBQU0sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxZQUFtQjtRQUN2QyxJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0MsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQzFCLENBQUM7UUFDRCxNQUFNLGdCQUFnQixHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFTSxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQWdCLEVBQUUsSUFBUztRQUNwRCxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxRQUFRLFlBQVksQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRU0saUJBQWlCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUMxQixDQUFDO0lBRU0sa0JBQWtCLENBQUMsWUFBbUI7UUFDekMsWUFBTSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsWUFBWSxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2xCLHVEQUF1RDtRQUN2RCxLQUFLLE1BQU0sRUFBRSxTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDakQsU0FBUyxDQUFDLG1CQUFtQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUErQixDQUFDLENBQUMsQ0FBQztRQUNqRixDQUFDO0lBQ0wsQ0FBQztJQUVNLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDekIsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxHQUF5QixFQUFFLEdBQXdCO1FBQy9FLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDakQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQztRQUVwQyxtRUFBbUU7UUFDbkUsbUVBQW1FO1FBQ25FLG9FQUFvRTtRQUNwRSxvRUFBb0U7UUFDcEUsb0VBQW9FO1FBQ3BFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQzVFLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsbUVBQW1FLENBQUMsQ0FBQztRQUNuSCxHQUFHLENBQUMsU0FBUyxDQUFDLCtCQUErQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFFakUsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzNCLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkIsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1YsT0FBTztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDRCxJQUFJLFFBQVEsS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDdEIsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUN0QyxPQUFPO1lBQ1gsQ0FBQztZQUNELElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7Z0JBQzNELEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4RSxPQUFPO1lBQ1gsQ0FBQztZQUNELElBQUksUUFBUSxLQUFLLFlBQVksSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7Z0JBQzNELEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbEUsT0FBTztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSSxHQUFHLENBQUMsTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUN6RCxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN0RCxPQUFPO1lBQ1gsQ0FBQztZQUNELEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BELENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLFlBQU0sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsT0FBTyxFQUFFLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDekYsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQXlCLEVBQUUsR0FBd0I7UUFDOUUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBdUIsQ0FBQztRQUV0RSxzRUFBc0U7UUFDdEUscUVBQXFFO1FBQ3JFLDBFQUEwRTtRQUMxRSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDeEIsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ25FLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBQztnQkFDbkMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztnQkFDekUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSztvQkFDOUIsQ0FBQyxDQUFDLDJDQUEyQztvQkFDN0MsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztnQkFDNUIsT0FBTztZQUNYLENBQUM7WUFDRCxLQUFLLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNsQyxNQUFNLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5QyxPQUFPO1FBQ1gsQ0FBQztRQUVELG9FQUFvRTtRQUNwRSxNQUFNLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxJQUFJLFVBQWUsQ0FBQztRQUNwQixJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbEIsSUFBSSxDQUFDO2dCQUNELFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLENBQUM7WUFBQyxPQUFPLFVBQWUsRUFBRSxDQUFDO2dCQUN2QixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7Z0JBQzNELEdBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsS0FBSyxFQUN2QixnQkFBZ0IsVUFBVSxDQUFDLE9BQU8sV0FBVyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDNUUsT0FBTztZQUNYLENBQUM7UUFDTCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3RFLElBQUksUUFBUSxFQUFFLENBQUM7WUFDWCxRQUFRLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNyQyxNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDN0QsT0FBTztRQUNYLENBQUM7UUFFRCxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLElBQUEsOEJBQW1CLEVBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNuQyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFDM0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLEVBQUUsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO1lBQzNFLE9BQU87UUFDWCxDQUFDO1FBRUQsb0VBQW9FO1FBQ3BFLHdFQUF3RTtRQUN4RSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxpREFBNkIsQ0FBQztZQUNoRCxrQkFBa0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFBLG1CQUFVLEdBQUU7WUFDdEMsa0JBQWtCLEVBQUUsSUFBSTtZQUN4QixvQkFBb0IsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO2dCQUN6QixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RSxZQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLFlBQVksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzFGLENBQUM7WUFDRCxlQUFlLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRTtnQkFDcEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3pCLFlBQU0sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsZ0JBQWdCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUN6RixDQUFDO1NBQ0osQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25DLE1BQU0sU0FBUyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFTSxLQUFLLENBQUMsSUFBSTs7UUFDYixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN2QixhQUFhLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLENBQUM7UUFDRCxLQUFLLE1BQU0sRUFBRSxTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDakQsSUFBSSxDQUFDO2dCQUNELE1BQU0sU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzVCLENBQUM7WUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNULFlBQU0sQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNMLENBQUM7UUFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3RCLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xCLGdFQUFnRTtZQUNoRSxnRUFBZ0U7WUFDaEUsTUFBQSxNQUFBLElBQUksQ0FBQyxVQUFVLEVBQUMsbUJBQW1CLGtEQUFJLENBQUM7WUFDeEMsTUFBTSxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRTtnQkFDOUIsSUFBSSxDQUFDLFVBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUM1QyxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ3ZCLFlBQU0sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUNuRCxDQUFDO0lBQ0wsQ0FBQztJQUVNLFNBQVM7UUFDWixPQUFPO1lBQ0gsT0FBTyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVTtZQUMxQixJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJO1lBQ3hCLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUk7U0FDOUIsQ0FBQztJQUNOLENBQUM7SUFFTyxLQUFLLENBQUMsc0JBQXNCLENBQUMsR0FBeUIsRUFBRSxHQUF3QixFQUFFLFFBQWdCO1FBQ3RHLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsbURBQW1ELEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEYsT0FBTztRQUNYLENBQUM7UUFDRCxNQUFNLFlBQVksR0FBRyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUV2RCxNQUFNLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxJQUFJLE1BQVcsQ0FBQztRQUNoQixJQUFJLENBQUM7WUFDRCxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUFDLE9BQU8sVUFBZSxFQUFFLENBQUM7WUFDdkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBQzNELEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLDhCQUE4QjtnQkFDckMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxPQUFPO2dCQUMzQixZQUFZLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO2FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1lBQ0osT0FBTztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2hFLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLFlBQU0sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEYsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sc0JBQXNCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDN0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFDLE9BQU87Z0JBQ0gsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFFBQVE7Z0JBQ1IsUUFBUTtnQkFDUixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7Z0JBQzdCLE9BQU8sRUFBRSxRQUFRLFFBQVEsSUFBSSxRQUFRLEVBQUU7Z0JBQ3ZDLFdBQVcsRUFBRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDO2FBQzlFLENBQUM7UUFDTixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxRQUFnQixFQUFFLFFBQWdCLEVBQUUsTUFBVztRQUN2RSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE9BQU8saUNBQWlDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxRQUFRLFFBQVEsSUFBSSxRQUFROztRQUV0RixVQUFVLEdBQUcsQ0FBQztJQUNsQixDQUFDO0lBRU8sb0JBQW9CLENBQUMsTUFBVzs7UUFDcEMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVO1lBQUUsT0FBTyxFQUFFLENBQUM7UUFDN0MsTUFBTSxNQUFNLEdBQVEsRUFBRSxDQUFDO1FBQ3ZCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFpQixDQUFDLEVBQUUsQ0FBQztZQUNqRSxNQUFNLFVBQVUsR0FBRyxJQUFXLENBQUM7WUFDL0IsUUFBUSxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3RCLEtBQUssUUFBUTtvQkFDVCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBQSxVQUFVLENBQUMsT0FBTyxtQ0FBSSxnQkFBZ0IsQ0FBQztvQkFDckQsTUFBTTtnQkFDVixLQUFLLFFBQVE7b0JBQ1QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQUEsVUFBVSxDQUFDLE9BQU8sbUNBQUksRUFBRSxDQUFDO29CQUN2QyxNQUFNO2dCQUNWLEtBQUssU0FBUztvQkFDVixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBQSxVQUFVLENBQUMsT0FBTyxtQ0FBSSxJQUFJLENBQUM7b0JBQ3pDLE1BQU07Z0JBQ1YsS0FBSyxRQUFRO29CQUNULE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFBLFVBQVUsQ0FBQyxPQUFPLG1DQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDekQsTUFBTTtnQkFDVjtvQkFDSSxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsZUFBZSxDQUFDO1lBQ3RDLENBQUM7UUFDTCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVNLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBMkI7UUFDbkQsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDaEIsWUFBTSxDQUFDLElBQUksQ0FBQyxpRUFBaUUsQ0FBQyxDQUFDO1lBQy9FLE9BQU87UUFDWCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDckIsSUFBSSxDQUFDO1lBQ0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7WUFDekIsSUFBQSx3QkFBa0IsRUFBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDNUMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2xCLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNsQixNQUFNLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN2QixDQUFDO1FBQ0wsQ0FBQztnQkFBUyxDQUFDO1lBQ1AsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDMUIsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQS9hRCw4QkErYUM7QUFFRCxTQUFTLFFBQVEsQ0FBQyxHQUF5QjtJQUN2QyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ25DLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNkLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLEdBQUcsSUFBSSxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25DLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzVCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgU2VydmVyIH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvaW5kZXguanMnO1xuaW1wb3J0IHsgU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9zdHJlYW1hYmxlSHR0cC5qcyc7XG5pbXBvcnQge1xuICAgIENhbGxUb29sUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0VG9vbHNSZXF1ZXN0U2NoZW1hLFxuICAgIGlzSW5pdGlhbGl6ZVJlcXVlc3QsXG59IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvdHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQU2VydmVyU2V0dGluZ3MsIFNlcnZlclN0YXR1cywgVG9vbERlZmluaXRpb24gfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHNldERlYnVnTG9nRW5hYmxlZCwgbG9nZ2VyIH0gZnJvbSAnLi9saWIvbG9nJztcbmltcG9ydCB7IFRvb2xSZWdpc3RyeSB9IGZyb20gJy4vdG9vbHMvcmVnaXN0cnknO1xuXG5jb25zdCBTRVJWRVJfTkFNRSA9ICdjb2Nvcy1tY3Atc2VydmVyJztcbmNvbnN0IFNFUlZFUl9WRVJTSU9OID0gJzIuMC4wJztcblxuLy8gSWRsZSBzZXNzaW9uIHN3ZWVwOiBkcm9wIHNlc3Npb25zIHRoYXQgaGF2ZW4ndCBiZWVuIHRvdWNoZWQgaW4gdGhpcyBtYW55IG1zLlxuLy8gU2V0IGNvbnNlcnZhdGl2ZWx5IGxvbmcgZm9yIGVkaXRvciB1c2FnZSB3aGVyZSBhIGRldmVsb3BlciBtYXkgcGF1c2Ugd29yay5cbmNvbnN0IFNFU1NJT05fSURMRV9USU1FT1VUX01TID0gMzAgKiA2MCAqIDEwMDA7XG5jb25zdCBTRVNTSU9OX0NMRUFOVVBfSU5URVJWQUxfTVMgPSA2MCAqIDEwMDA7XG5cbmludGVyZmFjZSBTZXNzaW9uRW50cnkge1xuICAgIHRyYW5zcG9ydDogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQ7XG4gICAgc2RrU2VydmVyOiBTZXJ2ZXI7XG4gICAgbGFzdEFjdGl2aXR5QXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24ganNvblJwY0Vycm9yKGNvZGU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBqc29ucnBjOiAnMi4wJywgZXJyb3I6IHsgY29kZSwgbWVzc2FnZSB9LCBpZDogbnVsbCB9KTtcbn1cblxuLyoqXG4gKiBNQ1Agc2VydmVyIGJhY2tlZCBieSB0aGUgb2ZmaWNpYWwgQG1vZGVsY29udGV4dHByb3RvY29sL3NkayBTZXJ2ZXIgK1xuICogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgKHN0YXRlZnVsIG1vZGUpLlxuICpcbiAqIEVhY2ggTUNQIGNsaWVudCBnZXRzIGl0cyBvd24gU2VydmVyICsgVHJhbnNwb3J0IHBhaXIga2V5ZWQgYnlcbiAqIGBtY3Atc2Vzc2lvbi1pZGAuIEluaXRpYWxpemUgcmVxdWVzdHMgd2l0aCBubyBzZXNzaW9uIGlkIG1pbnQgYSBuZXcgcGFpci5cbiAqIFJFU1QgZW5kcG9pbnRzICgvaGVhbHRoLCAvYXBpL3Rvb2xzLCAvYXBpL3tjYXR9L3t0b29sfSkgc2hhcmUgdGhlIHNhbWVcbiAqIHVuZGVybHlpbmcgaHR0cC5TZXJ2ZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBNQ1BTZXJ2ZXIge1xuICAgIHByaXZhdGUgc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzO1xuICAgIHByaXZhdGUgaHR0cFNlcnZlcjogaHR0cC5TZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHNlc3Npb25zOiBNYXA8c3RyaW5nLCBTZXNzaW9uRW50cnk+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgdG9vbHM6IFRvb2xSZWdpc3RyeTtcbiAgICBwcml2YXRlIHRvb2xzTGlzdDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgIHByaXZhdGUgZW5hYmxlZFRvb2xzOiBhbnlbXSA9IFtdO1xuICAgIHByaXZhdGUgY2xlYW51cEludGVydmFsOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgdXBkYXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuICAgIGNvbnN0cnVjdG9yKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncywgcmVnaXN0cnk6IFRvb2xSZWdpc3RyeSkge1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMudG9vbHMgPSByZWdpc3RyeTtcbiAgICAgICAgc2V0RGVidWdMb2dFbmFibGVkKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVc2luZyBzaGFyZWQgdG9vbCByZWdpc3RyeSAoJHtPYmplY3Qua2V5cyhyZWdpc3RyeSkubGVuZ3RofSBjYXRlZ29yaWVzKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRTZGtTZXJ2ZXIoKTogU2VydmVyIHtcbiAgICAgICAgY29uc3Qgc2RrU2VydmVyID0gbmV3IFNlcnZlcihcbiAgICAgICAgICAgIHsgbmFtZTogU0VSVkVSX05BTUUsIHZlcnNpb246IFNFUlZFUl9WRVJTSU9OIH0sXG4gICAgICAgICAgICB7IGNhcGFiaWxpdGllczogeyB0b29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9IH0gfVxuICAgICAgICApO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5tYXAodCA9PiAoe1xuICAgICAgICAgICAgICAgIG5hbWU6IHQubmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogdC5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoQ2FsbFRvb2xSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBuYW1lLCBhcmd1bWVudHM6IGFyZ3MgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChuYW1lLCBhcmdzID8/IHt9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5idWlsZFRvb2xSZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfV0sXG4gICAgICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzZGtTZXJ2ZXI7XG4gICAgfVxuXG4gICAgLy8gVC1QMS01OiBUb29sUmVzcG9uc2Ug4oaSIE1DUCBDYWxsVG9vbFJlc3VsdC4gRmFpbHVyZXMgY2FycnkgdGhlIGVycm9yXG4gICAgLy8gbWVzc2FnZSBpbiB0ZXh0IGNvbnRlbnQgKyBpc0Vycm9yLiBTdWNjZXNzZXMga2VlcCBKU09OLnN0cmluZ2lmeShyZXN1bHQpXG4gICAgLy8gaW4gdGV4dCAoYmFjay1jb21wYXQpIGFuZCB0aGUgcGFyc2VkIG9iamVjdCBpbiBzdHJ1Y3R1cmVkQ29udGVudC5cbiAgICBwcml2YXRlIGJ1aWxkVG9vbFJlc3VsdChyZXN1bHQ6IGFueSkge1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgY29uc3QgbXNnID0gcmVzdWx0LmVycm9yID8/IHJlc3VsdC5tZXNzYWdlID8/ICdUb29sIGZhaWxlZCc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBKU09OLnN0cmluZ2lmeShtc2cpIH1dLFxuICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRleHQgPSB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XG4gICAgICAgIGNvbnN0IG91dDogeyBjb250ZW50OiBBcnJheTx7IHR5cGU6ICd0ZXh0JzsgdGV4dDogc3RyaW5nIH0+OyBzdHJ1Y3R1cmVkQ29udGVudD86IGFueSB9ID0ge1xuICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dLFxuICAgICAgICB9O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBvdXQuc3RydWN0dXJlZENvbnRlbnQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnW01DUFNlcnZlcl0gU2VydmVyIGlzIGFscmVhZHkgcnVubmluZycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXR1cFRvb2xzKCk7XG5cbiAgICAgICAgY29uc3QgeyBwb3J0IH0gPSB0aGlzLnNldHRpbmdzO1xuICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gU3RhcnRpbmcgSFRUUCBzZXJ2ZXIgb24gcG9ydCAke3BvcnR9Li4uYCk7XG4gICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKHRoaXMuaGFuZGxlSHR0cFJlcXVlc3QuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5saXN0ZW4ocG9ydCwgJzEyNy4wLjAuMScsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0g4pyFIEhUVFAgc2VydmVyIHN0YXJ0ZWQgb24gaHR0cDovLzEyNy4wLjAuMToke3BvcnR9YCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIEhlYWx0aCBjaGVjazogaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L2hlYWx0aGApO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBNQ1AgZW5kcG9pbnQ6ICBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbWNwYCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLm9uKCdlcnJvcicsIChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0g4p2MIEZhaWxlZCB0byBzdGFydCBzZXJ2ZXI6JywgZXJyKTtcbiAgICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoYFtNQ1BTZXJ2ZXJdIFBvcnQgJHtwb3J0fSBpcyBhbHJlYWR5IGluIHVzZS4gUGxlYXNlIGNoYW5nZSB0aGUgcG9ydCBpbiBzZXR0aW5ncy5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gc2V0SW50ZXJ2YWwga2VlcHMgdGhlIE5vZGUgZXZlbnQgbG9vcCBhbGl2ZTsgdW5yZWYgc28gd2UgZG9uJ3RcbiAgICAgICAgLy8gYmxvY2sgZXh0ZW5zaW9uIHRlYXJkb3duIGlmIHN0b3AoKSBzb21laG93IGRvZXNuJ3QgcnVuLlxuICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHRoaXMuc3dlZXBJZGxlU2Vzc2lvbnMoKSwgU0VTU0lPTl9DTEVBTlVQX0lOVEVSVkFMX01TKTtcbiAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwudW5yZWY/LigpO1xuXG4gICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSDwn5qAIE1DUCBTZXJ2ZXIgcmVhZHkgKCR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scylgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN3ZWVwSWRsZVNlc3Npb25zKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9ucy5zaXplID09PSAwKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGN1dG9mZiA9IERhdGUubm93KCkgLSBTRVNTSU9OX0lETEVfVElNRU9VVF9NUztcbiAgICAgICAgY29uc3Qgc3RhbGU6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy5zZXNzaW9ucykge1xuICAgICAgICAgICAgaWYgKGVudHJ5Lmxhc3RBY3Rpdml0eUF0IDwgY3V0b2ZmKSBzdGFsZS5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIHN0YWxlKSB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMuc2Vzc2lvbnMuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmICghZW50cnkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgZW50cnkudHJhbnNwb3J0LmNsb3NlKCkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gc3dlZXAgY2xvc2UgZXJyb3IgZm9yICR7aWR9OmAsIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3dlcHQgaWRsZSBzZXNzaW9uOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwVG9vbHMoKTogdm9pZCB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBuZXcgbGlzdCBsb2NhbGx5IGFuZCBvbmx5IHN3YXAgb25jZSBpdCdzIHJlYWR5LCBzbyB0aGF0XG4gICAgICAgIC8vIGEgY29uY3VycmVudCBMaXN0VG9vbHNSZXF1ZXN0IGNhbiBuZXZlciBvYnNlcnZlIGFuIGVtcHR5IGxpc3QuXG4gICAgICAgIGNvbnN0IGVuYWJsZWRGaWx0ZXIgPSB0aGlzLmVuYWJsZWRUb29scy5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IG5ldyBTZXQodGhpcy5lbmFibGVkVG9vbHMubWFwKHQgPT4gYCR7dC5jYXRlZ29yeX1fJHt0Lm5hbWV9YCkpXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgY29uc3QgbmV4dDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtjYXRlZ29yeSwgdG9vbFNldF0gb2YgT2JqZWN0LmVudHJpZXModGhpcy50b29scykpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcU5hbWUgPSBgJHtjYXRlZ29yeX1fJHt0b29sLm5hbWV9YDtcbiAgICAgICAgICAgICAgICBpZiAoZW5hYmxlZEZpbHRlciAmJiAhZW5hYmxlZEZpbHRlci5oYXMoZnFOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbmV4dC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogZnFOYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvb2wuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b29sc0xpc3QgPSBuZXh0O1xuXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gU2V0dXAgdG9vbHM6ICR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0RmlsdGVyZWRUb29scyhlbmFibGVkVG9vbHM6IGFueVtdKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIGlmICghZW5hYmxlZFRvb2xzIHx8IGVuYWJsZWRUb29scy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbmFibGVkVG9vbE5hbWVzID0gbmV3IFNldChlbmFibGVkVG9vbHMubWFwKHQgPT4gYCR7dC5jYXRlZ29yeX1fJHt0Lm5hbWV9YCkpO1xuICAgICAgICByZXR1cm4gdGhpcy50b29sc0xpc3QuZmlsdGVyKHQgPT4gZW5hYmxlZFRvb2xOYW1lcy5oYXModC5uYW1lKSk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVUb29sQ2FsbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICBjb25zdCBbY2F0ZWdvcnksIC4uLnJlc3RdID0gdG9vbE5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgY29uc3QgZXhlY3V0b3IgPSB0aGlzLnRvb2xzW2NhdGVnb3J5XTtcbiAgICAgICAgaWYgKCFleGVjdXRvcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleGVjdXRvci5leGVjdXRlKHJlc3Quam9pbignXycpLCBhcmdzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29sczogYW55W10pOiB2b2lkIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVcGRhdGluZyBlbmFibGVkIHRvb2xzOiAke2VuYWJsZWRUb29scy5sZW5ndGh9IHRvb2xzYCk7XG4gICAgICAgIHRoaXMuZW5hYmxlZFRvb2xzID0gZW5hYmxlZFRvb2xzO1xuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcbiAgICAgICAgLy8gTm90aWZ5IGFsbCBsaXZlIHNlc3Npb25zIHRoYXQgdGhlIHRvb2wgbGlzdCBjaGFuZ2VkLlxuICAgICAgICBmb3IgKGNvbnN0IHsgc2RrU2VydmVyIH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgc2RrU2VydmVyLnNlbmRUb29sTGlzdENoYW5nZWQoKS5jYXRjaCgoKSA9PiB7IC8qIHBlZXIgbWF5IGhhdmUgZHJvcHBlZCAqLyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTZXR0aW5ncygpOiBNQ1BTZXJ2ZXJTZXR0aW5ncyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlSHR0cFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFVybCA9IHVybC5wYXJzZShyZXEudXJsIHx8ICcnLCB0cnVlKTtcbiAgICAgICAgY29uc3QgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cbiAgICAgICAgLy8gQ09SUyBpcyB3aWxkY2FyZCBzbyB0aGUgQ29jb3MgQ3JlYXRvciBwYW5lbCB3ZWJ2aWV3ICh3aGljaCBsb2Fkc1xuICAgICAgICAvLyBmcm9tIGEgYGZpbGU6Ly9gIG9yIGBkZXZ0b29sczovL2Agb3JpZ2luKSBjYW4gaGl0IHRoaXMgZW5kcG9pbnQuXG4gICAgICAgIC8vIFRoZSBzZXJ2ZXIgb25seSBsaXN0ZW5zIG9uIDEyNy4wLjAuMSwgc28gZXh0ZXJuYWwgYXR0YWNrZXJzIGNhbid0XG4gICAgICAgIC8vIHJlYWNoIGl0OyB0aGUgd2lsZGNhcmQgZG9lcyBtZWFuIGFueSBsb2NhbCB3ZWIgcGFnZSBpbiB0aGUgdXNlcidzXG4gICAgICAgIC8vIGJyb3dzZXIgY291bGQgcHJvYmUgaXQsIHdoaWNoIGlzIGFjY2VwdGFibGUgZm9yIGEgZGV2ZWxvcGVyIHRvb2wuXG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsICcqJyk7XG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULCBQT1NULCBPUFRJT05TLCBERUxFVEUnKTtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24sIG1jcC1zZXNzaW9uLWlkLCBtY3AtcHJvdG9jb2wtdmVyc2lvbicpO1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdtY3Atc2Vzc2lvbi1pZCcpO1xuXG4gICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjA0KTtcbiAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvbWNwJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlTWNwUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2hlYWx0aCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICdvaycsIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5sZW5ndGggfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvdG9vbHMnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgdG9vbHM6IHRoaXMuZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9hcGkvJykgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcSwgcmVzLCBwYXRobmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ05vdCBmb3VuZCcgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIEhUVFAgcmVxdWVzdCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJywgZGV0YWlsczogZXJyb3I/Lm1lc3NhZ2UgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSByZXEuaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gR0VUIChzZXJ2ZXItaW5pdGlhdGVkIFNTRSkgYW5kIERFTEVURSAoZXhwbGljaXQgc2Vzc2lvbiBjbG9zZSkgYm90aFxuICAgICAgICAvLyByZXF1aXJlIGFuIGV4aXN0aW5nIHNlc3Npb24uIFBlciBTdHJlYW1hYmxlIEhUVFAgc3BlYywgR0VUIHdpdGhvdXRcbiAgICAgICAgLy8gc2Vzc2lvbiBpcyBcIm1ldGhvZCBub3QgYWxsb3dlZFwiOyBERUxFVEUgd2l0aG91dCBzZXNzaW9uIGlzIFwibm90IGZvdW5kXCIuXG4gICAgICAgIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gc2Vzc2lvbklkID8gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghZW50cnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0dldCA9IHJlcS5tZXRob2QgPT09ICdHRVQnO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoaXNHZXQgPyA0MDUgOiA0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsIGlzR2V0XG4gICAgICAgICAgICAgICAgICAgID8gJ01ldGhvZCBub3QgYWxsb3dlZCB3aXRob3V0IGFjdGl2ZSBzZXNzaW9uJ1xuICAgICAgICAgICAgICAgICAgICA6ICdTZXNzaW9uIG5vdCBmb3VuZCcpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbnRyeS5sYXN0QWN0aXZpdHlBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBlbnRyeS50cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQT1NUOiByZWFkIGJvZHkgb25jZSBzbyB3ZSBjYW4gZGV0ZWN0IGluaXRpYWxpemUgYmVmb3JlIGRpc3BhdGNoLlxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgbGV0IHBhcnNlZEJvZHk6IGFueTtcbiAgICAgICAgaWYgKGJvZHkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwYXJzZWRCb2R5ID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyNzAwLFxuICAgICAgICAgICAgICAgICAgICBgUGFyc2UgZXJyb3I6ICR7cGFyc2VFcnJvci5tZXNzYWdlfS4gQm9keTogJHtib2R5LnN1YnN0cmluZygwLCAyMDApfWApKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZyA9IHNlc3Npb25JZCA/IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgZXhpc3RpbmcubGFzdEFjdGl2aXR5QXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgZXhpc3RpbmcudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IHNlc3Npb24gbXVzdCBjb21lIHdpdGggYW4gaW5pdGlhbGl6ZSByZXF1ZXN0LlxuICAgICAgICBpZiAoIWlzSW5pdGlhbGl6ZVJlcXVlc3QocGFyc2VkQm9keSkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsICdCYWQgUmVxdWVzdDogTm8gdmFsaWQgc2Vzc2lvbiBJRCBwcm92aWRlZCcpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBTZXJ2ZXIgZmlyc3Qgc28gdGhlIHRyYW5zcG9ydCBjYWxsYmFjayBjbG9zdXJlIGNhcHR1cmVzXG4gICAgICAgIC8vIGFuIGFscmVhZHktaW5pdGlhbGl6ZWQgYmluZGluZyAoYXZvaWRzIFREWi1zdHlsZSBvcmRlcmluZyBzdXJwcmlzZXMpLlxuICAgICAgICBjb25zdCBzZGtTZXJ2ZXIgPSB0aGlzLmJ1aWxkU2RrU2VydmVyKCk7XG4gICAgICAgIGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCh7XG4gICAgICAgICAgICBzZXNzaW9uSWRHZW5lcmF0b3I6ICgpID0+IHJhbmRvbVVVSUQoKSxcbiAgICAgICAgICAgIGVuYWJsZUpzb25SZXNwb25zZTogdHJ1ZSxcbiAgICAgICAgICAgIG9uc2Vzc2lvbmluaXRpYWxpemVkOiAoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb25zLnNldChpZCwgeyB0cmFuc3BvcnQsIHNka1NlcnZlciwgbGFzdEFjdGl2aXR5QXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzZXNzaW9uIGluaXRpYWxpemVkOiAke2lkfSAodG90YWw6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbnNlc3Npb25jbG9zZWQ6IChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHNlc3Npb24gY2xvc2VkOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgYXdhaXQgc2RrU2VydmVyLmNvbm5lY3QodHJhbnNwb3J0KTtcbiAgICAgICAgYXdhaXQgdHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy5jbGVhbnVwSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5jbGVhbnVwSW50ZXJ2YWwpO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgeyB0cmFuc3BvcnQgfSBvZiB0aGlzLnNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRyYW5zcG9ydC5jbG9zZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQU2VydmVyXSB0cmFuc3BvcnQgY2xvc2UgZXJyb3I6JywgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9ucy5jbGVhcigpO1xuICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAvLyBjbG9zZSgpIG9ubHkgcmVmdXNlcyBORVcgY29ubmVjdGlvbnM7IGtlZXAtYWxpdmUgc29ja2V0cyBzdGF5XG4gICAgICAgICAgICAvLyBvcGVuIGFuZCB3b3VsZCBibG9jayBjbG9zZSgpIGZvcmV2ZXIuIEZvcmNlIHRoZW0gdG8gZHJvcCB0b28uXG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucz8uKCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLmNsb3NlKCgpID0+IHJlc29sdmUoKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IG51bGw7XG4gICAgICAgICAgICBsb2dnZXIuaW5mbygnW01DUFNlcnZlcl0gSFRUUCBzZXJ2ZXIgc3RvcHBlZCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFN0YXR1cygpOiBTZXJ2ZXJTdGF0dXMge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcnVubmluZzogISF0aGlzLmh0dHBTZXJ2ZXIsXG4gICAgICAgICAgICBwb3J0OiB0aGlzLnNldHRpbmdzLnBvcnQsXG4gICAgICAgICAgICBjbGllbnRzOiB0aGlzLnNlc3Npb25zLnNpemUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcGF0aG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBwYXRoUGFydHMgPSBwYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihwID0+IHApO1xuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIEFQSSBwYXRoLiBVc2UgL2FwaS97Y2F0ZWdvcnl9L3t0b29sX25hbWV9JyB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbFRvb2xOYW1lID0gYCR7cGF0aFBhcnRzWzFdfV8ke3BhdGhQYXJ0c1syXX1gO1xuXG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBsZXQgcGFyYW1zOiBhbnk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwYXJhbXMgPSBib2R5ID8gSlNPTi5wYXJzZShib2R5KSA6IHt9O1xuICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBlcnJvcjogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICAgICAgICAgIGRldGFpbHM6IHBhcnNlRXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZEJvZHk6IGJvZHkuc3Vic3RyaW5nKDAsIDIwMCksXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwoZnVsbFRvb2xOYW1lLCBwYXJhbXMpO1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCB0b29sOiBmdWxsVG9vbE5hbWUsIHJlc3VsdCB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0gU2ltcGxlIEFQSSBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgdG9vbDogcGF0aG5hbWUgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTaW1wbGlmaWVkVG9vbHNMaXN0KCk6IGFueVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9vbHNMaXN0Lm1hcCh0b29sID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gdG9vbC5uYW1lLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHBhcnRzWzBdO1xuICAgICAgICAgICAgY29uc3QgdG9vbE5hbWUgPSBwYXJ0cy5zbGljZSgxKS5qb2luKCdfJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICB0b29sTmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBhcGlQYXRoOiBgL2FwaS8ke2NhdGVnb3J5fS8ke3Rvb2xOYW1lfWAsXG4gICAgICAgICAgICAgICAgY3VybEV4YW1wbGU6IHRoaXMuZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeSwgdG9vbE5hbWUsIHRvb2wuaW5wdXRTY2hlbWEpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZUN1cmxFeGFtcGxlKGNhdGVnb3J5OiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIHNjaGVtYTogYW55KTogc3RyaW5nIHtcbiAgICAgICAgY29uc3Qgc2FtcGxlUGFyYW1zID0gdGhpcy5nZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWEpO1xuICAgICAgICBjb25zdCBqc29uU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2FtcGxlUGFyYW1zLCBudWxsLCAyKTtcbiAgICAgICAgcmV0dXJuIGBjdXJsIC1YIFBPU1QgaHR0cDovLzEyNy4wLjAuMToke3RoaXMuc2V0dGluZ3MucG9ydH0vYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9IFxcXFxcbiAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxcXG4gIC1kICcke2pzb25TdHJpbmd9J2A7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWE6IGFueSk6IGFueSB7XG4gICAgICAgIGlmICghc2NoZW1hIHx8ICFzY2hlbWEucHJvcGVydGllcykgcmV0dXJuIHt9O1xuICAgICAgICBjb25zdCBzYW1wbGU6IGFueSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzIGFzIGFueSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BTY2hlbWEgPSBwcm9wIGFzIGFueTtcbiAgICAgICAgICAgIHN3aXRjaCAocHJvcFNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gJ2V4YW1wbGVfc3RyaW5nJztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gNDI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSAnZXhhbXBsZV92YWx1ZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNhbXBsZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLnVwZGF0aW5nKSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUFNlcnZlcl0gdXBkYXRlU2V0dGluZ3MgaWdub3JlZCDigJQgYW5vdGhlciB1cGRhdGUgaW4gcHJvZ3Jlc3MnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdG9wKCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZWFkQm9keShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBsZXQgYm9keSA9ICcnO1xuICAgICAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiB7IGJvZHkgKz0gY2h1bmsudG9TdHJpbmcoKTsgfSk7XG4gICAgICAgIHJlcS5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShib2R5KSk7XG4gICAgICAgIHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuICAgIH0pO1xufVxuIl19