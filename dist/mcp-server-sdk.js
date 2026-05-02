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
const runtime_flags_1 = require("./lib/runtime-flags");
const registry_1 = require("./resources/registry");
const broadcast_bridge_1 = require("./lib/broadcast-bridge");
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
        var _a, _b;
        this.httpServer = null;
        this.sessions = new Map();
        this.toolsList = [];
        this.enabledTools = [];
        this.cleanupInterval = null;
        this.updating = false;
        // T-V25-3: bridge cocos editor IPC broadcasts → MCP
        // notifications/resources/updated. start()/stop() lifecycle
        // tied to the HTTP server.
        this.broadcastBridge = new broadcast_bridge_1.BroadcastBridge();
        this.settings = settings;
        this.tools = registry;
        this.resources = (0, registry_1.createResourceRegistry)(registry);
        (0, log_1.setDebugLogEnabled)(settings.enableDebugLog);
        (0, runtime_flags_1.setEditorContextEvalEnabled)((_a = settings.enableEditorContextEval) !== null && _a !== void 0 ? _a : false);
        (0, runtime_flags_1.setSceneLogCaptureEnabled)((_b = settings.enableSceneLogCapture) !== null && _b !== void 0 ? _b : true);
        log_1.logger.debug(`[MCPServer] Using shared tool registry (${Object.keys(registry).length} categories)`);
    }
    buildSdkServer(subscriptions) {
        const sdkServer = new index_js_1.Server({ name: SERVER_NAME, version: SERVER_VERSION }, {
            capabilities: {
                tools: { listChanged: true },
                // T-V25-3 (T-P3-3): subscribe is now true — clients can
                // resources/subscribe to a URI; the broadcast-bridge
                // pushes notifications/resources/updated when the
                // mapped cocos broadcast fires (debounced per URI).
                // RFC 6570 templates are implicitly supported by registering
                // ListResourceTemplatesRequestSchema below — MCP spec has no
                // resources.templates capability flag (cocos-cli's
                // `templates: true` is non-spec and would be stripped).
                resources: { listChanged: true, subscribe: true },
            },
        });
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
        sdkServer.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => ({
            resources: this.resources.list(),
        }));
        sdkServer.setRequestHandler(types_js_1.ListResourceTemplatesRequestSchema, async () => ({
            resourceTemplates: this.resources.listTemplates(),
        }));
        sdkServer.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const content = await this.resources.read(uri);
            return { contents: [content] };
        });
        // T-V25-3: per-session resource subscription handlers. The
        // `subscriptions` Set is captured at session-creation time and
        // shared with the SessionEntry so `notifyResourceUpdated`
        // can iterate sessions and check membership without a second
        // lookup.
        sdkServer.setRequestHandler(types_js_1.SubscribeRequestSchema, async (request) => {
            const { uri } = request.params;
            subscriptions.add(uri);
            log_1.logger.debug(`[MCPServer] subscribe ${uri} (session active subs: ${subscriptions.size})`);
            return {};
        });
        sdkServer.setRequestHandler(types_js_1.UnsubscribeRequestSchema, async (request) => {
            const { uri } = request.params;
            subscriptions.delete(uri);
            log_1.logger.debug(`[MCPServer] unsubscribe ${uri} (session active subs: ${subscriptions.size})`);
            return {};
        });
        return sdkServer;
    }
    /**
     * T-V25-3: dispatch a notifications/resources/updated to every
     * session that previously called resources/subscribe on this URI.
     * Called by BroadcastBridge after its per-URI debounce fires.
     */
    notifyResourceUpdated(uri) {
        var _a;
        let pushed = 0;
        for (const session of this.sessions.values()) {
            if (!session.subscriptions.has(uri))
                continue;
            try {
                session.sdkServer.notification({
                    method: 'notifications/resources/updated',
                    params: { uri },
                });
                pushed += 1;
            }
            catch (err) {
                log_1.logger.warn(`[MCPServer] notification push failed for ${uri}:`, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
            }
        }
        if (pushed > 0) {
            log_1.logger.debug(`[MCPServer] resources/updated ${uri} → ${pushed} session(s)`);
        }
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
        // T-V25-3: spin up the cocos broadcast → MCP notifications bridge.
        // Disabled outside the editor host (e.g. headless smoke runs)
        // because Editor.Message.__protected__ isn't available there;
        // BroadcastBridge.start() detects this and logs a warning.
        this.broadcastBridge.start((uri) => this.notifyResourceUpdated(uri));
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
        log_1.logger.debug(`[MCPServer] Setup tools: ${this.toolsList.length} tools available`);
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
        // T-V25-3: pre-create the per-session subscriptions Set and pass it
        // into buildSdkServer so the Subscribe/Unsubscribe handlers and the
        // SessionEntry both reference the same Set instance.
        const subscriptions = new Set();
        const sdkServer = this.buildSdkServer(subscriptions);
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: () => (0, crypto_1.randomUUID)(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
                this.sessions.set(id, { transport, sdkServer, lastActivityAt: Date.now(), subscriptions });
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
        // T-V25-3: tear down the bridge before closing sessions so any
        // in-flight notification timers are cleared and no listeners
        // try to push to closed transports.
        this.broadcastBridge.stop();
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
        var _a, _b;
        if (this.updating) {
            log_1.logger.warn('[MCPServer] updateSettings ignored — another update in progress');
            return;
        }
        this.updating = true;
        try {
            this.settings = settings;
            (0, log_1.setDebugLogEnabled)(settings.enableDebugLog);
            // v2.3.1 review fix: panel toggles for enableEditorContextEval must
            // take effect immediately. Without this re-apply, disabling the
            // setting after enable would leave the runtime flag ON until the
            // entire extension reloads — a security-relevant gap because the
            // editor-context eval would keep accepting AI-generated host-side
            // code despite the user's panel choice.
            (0, runtime_flags_1.setEditorContextEvalEnabled)((_a = settings.enableEditorContextEval) !== null && _a !== void 0 ? _a : false);
            // v2.4.8 A3: re-apply scene-log-capture flag on every settings
            // change so panel toggle takes effect immediately, mirroring the
            // editorContextEval re-apply pattern.
            (0, runtime_flags_1.setSceneLogCaptureEnabled)((_b = settings.enableSceneLogCapture) !== null && _b !== void 0 ? _b : true);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFTNEM7QUFFNUMsbUNBQXVEO0FBQ3ZELHVEQUE2RjtBQUU3RixtREFBZ0Y7QUFDaEYsNkRBQXlEO0FBRXpELE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDO0FBQ3ZDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBWTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQWVsQixZQUFZLFFBQTJCLEVBQUUsUUFBc0I7O1FBYnZELGVBQVUsR0FBdUIsSUFBSSxDQUFDO1FBQ3RDLGFBQVEsR0FBOEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUdoRCxjQUFTLEdBQXFCLEVBQUUsQ0FBQztRQUNqQyxpQkFBWSxHQUFVLEVBQUUsQ0FBQztRQUN6QixvQkFBZSxHQUEwQixJQUFJLENBQUM7UUFDOUMsYUFBUSxHQUFZLEtBQUssQ0FBQztRQUNsQyxvREFBb0Q7UUFDcEQsNERB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LElBQUksSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNuQyxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IFNlcnZlciB9IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL2luZGV4LmpzJztcbmltcG9ydCB7IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvc3RyZWFtYWJsZUh0dHAuanMnO1xuaW1wb3J0IHtcbiAgICBDYWxsVG9vbFJlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hLFxuICAgIFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsXG4gICAgU3Vic2NyaWJlUmVxdWVzdFNjaGVtYSxcbiAgICBVbnN1YnNjcmliZVJlcXVlc3RTY2hlbWEsXG4gICAgaXNJbml0aWFsaXplUmVxdWVzdCxcbn0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1BTZXJ2ZXJTZXR0aW5ncywgU2VydmVyU3RhdHVzLCBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgc2V0RGVidWdMb2dFbmFibGVkLCBsb2dnZXIgfSBmcm9tICcuL2xpYi9sb2cnO1xuaW1wb3J0IHsgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkLCBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkIH0gZnJvbSAnLi9saWIvcnVudGltZS1mbGFncyc7XG5pbXBvcnQgeyBUb29sUmVnaXN0cnkgfSBmcm9tICcuL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IFJlc291cmNlUmVnaXN0cnksIGNyZWF0ZVJlc291cmNlUmVnaXN0cnkgfSBmcm9tICcuL3Jlc291cmNlcy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBCcm9hZGNhc3RCcmlkZ2UgfSBmcm9tICcuL2xpYi9icm9hZGNhc3QtYnJpZGdlJztcblxuY29uc3QgU0VSVkVSX05BTUUgPSAnY29jb3MtbWNwLXNlcnZlcic7XG5jb25zdCBTRVJWRVJfVkVSU0lPTiA9ICcyLjAuMCc7XG5cbi8vIElkbGUgc2Vzc2lvbiBzd2VlcDogZHJvcCBzZXNzaW9ucyB0aGF0IGhhdmVuJ3QgYmVlbiB0b3VjaGVkIGluIHRoaXMgbWFueSBtcy5cbi8vIFNldCBjb25zZXJ2YXRpdmVseSBsb25nIGZvciBlZGl0b3IgdXNhZ2Ugd2hlcmUgYSBkZXZlbG9wZXIgbWF5IHBhdXNlIHdvcmsuXG5jb25zdCBTRVNTSU9OX0lETEVfVElNRU9VVF9NUyA9IDMwICogNjAgKiAxMDAwO1xuY29uc3QgU0VTU0lPTl9DTEVBTlVQX0lOVEVSVkFMX01TID0gNjAgKiAxMDAwO1xuXG5pbnRlcmZhY2UgU2Vzc2lvbkVudHJ5IHtcbiAgICB0cmFuc3BvcnQ6IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0O1xuICAgIHNka1NlcnZlcjogU2VydmVyO1xuICAgIGxhc3RBY3Rpdml0eUF0OiBudW1iZXI7XG4gICAgLy8gVC1WMjUtMzogcGVyLXNlc3Npb24gcmVzb3VyY2UgVVJJIHN1YnNjcmlwdGlvbnMgZm9yXG4gICAgLy8gbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCBwdXNoLiBFbXB0eSBzZXQg4oaSIHNlc3Npb25cbiAgICAvLyBnZXRzIG5vIG5vdGlmaWNhdGlvbnMgZXZlbiBpZiB0aGUgYnJpZGdlIGZpcmVzLlxuICAgIHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+O1xufVxuXG5mdW5jdGlvbiBqc29uUnBjRXJyb3IoY29kZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh7IGpzb25ycGM6ICcyLjAnLCBlcnJvcjogeyBjb2RlLCBtZXNzYWdlIH0sIGlkOiBudWxsIH0pO1xufVxuXG4vKipcbiAqIE1DUCBzZXJ2ZXIgYmFja2VkIGJ5IHRoZSBvZmZpY2lhbCBAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrIFNlcnZlciArXG4gKiBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCAoc3RhdGVmdWwgbW9kZSkuXG4gKlxuICogRWFjaCBNQ1AgY2xpZW50IGdldHMgaXRzIG93biBTZXJ2ZXIgKyBUcmFuc3BvcnQgcGFpciBrZXllZCBieVxuICogYG1jcC1zZXNzaW9uLWlkYC4gSW5pdGlhbGl6ZSByZXF1ZXN0cyB3aXRoIG5vIHNlc3Npb24gaWQgbWludCBhIG5ldyBwYWlyLlxuICogUkVTVCBlbmRwb2ludHMgKC9oZWFsdGgsIC9hcGkvdG9vbHMsIC9hcGkve2NhdH0ve3Rvb2x9KSBzaGFyZSB0aGUgc2FtZVxuICogdW5kZXJseWluZyBodHRwLlNlcnZlci5cbiAqL1xuZXhwb3J0IGNsYXNzIE1DUFNlcnZlciB7XG4gICAgcHJpdmF0ZSBzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3M7XG4gICAgcHJpdmF0ZSBodHRwU2VydmVyOiBodHRwLlNlcnZlciB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFNlc3Npb25FbnRyeT4gPSBuZXcgTWFwKCk7XG4gICAgcHJpdmF0ZSB0b29sczogVG9vbFJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgcmVzb3VyY2VzOiBSZXNvdXJjZVJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgdG9vbHNMaXN0OiBUb29sRGVmaW5pdGlvbltdID0gW107XG4gICAgcHJpdmF0ZSBlbmFibGVkVG9vbHM6IGFueVtdID0gW107XG4gICAgcHJpdmF0ZSBjbGVhbnVwSW50ZXJ2YWw6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSB1cGRhdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuICAgIC8vIFQtVjI1LTM6IGJyaWRnZSBjb2NvcyBlZGl0b3IgSVBDIGJyb2FkY2FzdHMg4oaSIE1DUFxuICAgIC8vIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQuIHN0YXJ0KCkvc3RvcCgpIGxpZmVjeWNsZVxuICAgIC8vIHRpZWQgdG8gdGhlIEhUVFAgc2VydmVyLlxuICAgIHByaXZhdGUgYnJvYWRjYXN0QnJpZGdlOiBCcm9hZGNhc3RCcmlkZ2UgPSBuZXcgQnJvYWRjYXN0QnJpZGdlKCk7XG5cbiAgICBjb25zdHJ1Y3RvcihzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MsIHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICB0aGlzLnRvb2xzID0gcmVnaXN0cnk7XG4gICAgICAgIHRoaXMucmVzb3VyY2VzID0gY3JlYXRlUmVzb3VyY2VSZWdpc3RyeShyZWdpc3RyeSk7XG4gICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgIHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZChzZXR0aW5ncy5lbmFibGVFZGl0b3JDb250ZXh0RXZhbCA/PyBmYWxzZSk7XG4gICAgICAgIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlU2NlbmVMb2dDYXB0dXJlID8/IHRydWUpO1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFVzaW5nIHNoYXJlZCB0b29sIHJlZ2lzdHJ5ICgke09iamVjdC5rZXlzKHJlZ2lzdHJ5KS5sZW5ndGh9IGNhdGVnb3JpZXMpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFNka1NlcnZlcihzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPik6IFNlcnZlciB7XG4gICAgICAgIGNvbnN0IHNka1NlcnZlciA9IG5ldyBTZXJ2ZXIoXG4gICAgICAgICAgICB7IG5hbWU6IFNFUlZFUl9OQU1FLCB2ZXJzaW9uOiBTRVJWRVJfVkVSU0lPTiB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgICAgICAgICAgICB0b29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBULVYyNS0zIChULVAzLTMpOiBzdWJzY3JpYmUgaXMgbm93IHRydWUg4oCUIGNsaWVudHMgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc291cmNlcy9zdWJzY3JpYmUgdG8gYSBVUkk7IHRoZSBicm9hZGNhc3QtYnJpZGdlXG4gICAgICAgICAgICAgICAgICAgIC8vIHB1c2hlcyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIG1hcHBlZCBjb2NvcyBicm9hZGNhc3QgZmlyZXMgKGRlYm91bmNlZCBwZXIgVVJJKS5cbiAgICAgICAgICAgICAgICAgICAgLy8gUkZDIDY1NzAgdGVtcGxhdGVzIGFyZSBpbXBsaWNpdGx5IHN1cHBvcnRlZCBieSByZWdpc3RlcmluZ1xuICAgICAgICAgICAgICAgICAgICAvLyBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hIGJlbG93IOKAlCBNQ1Agc3BlYyBoYXMgbm9cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb3VyY2VzLnRlbXBsYXRlcyBjYXBhYmlsaXR5IGZsYWcgKGNvY29zLWNsaSdzXG4gICAgICAgICAgICAgICAgICAgIC8vIGB0ZW1wbGF0ZXM6IHRydWVgIGlzIG5vbi1zcGVjIGFuZCB3b3VsZCBiZSBzdHJpcHBlZCkuXG4gICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSwgc3Vic2NyaWJlOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICB0b29sczogdGhpcy50b29sc0xpc3QubWFwKHQgPT4gKHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHQuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHQuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICB9KSksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgbmFtZSwgYXJndW1lbnRzOiBhcmdzIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwobmFtZSwgYXJncyA/PyB7fSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRUb29sUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH1dLFxuICAgICAgICAgICAgICAgICAgICBpc0Vycm9yOiB0cnVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICByZXNvdXJjZXM6IHRoaXMucmVzb3VyY2VzLmxpc3QoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHJlc291cmNlVGVtcGxhdGVzOiB0aGlzLnJlc291cmNlcy5saXN0VGVtcGxhdGVzKCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvdXJjZXMucmVhZCh1cmkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgY29udGVudHM6IFtjb250ZW50XSB9O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVC1WMjUtMzogcGVyLXNlc3Npb24gcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIGhhbmRsZXJzLiBUaGVcbiAgICAgICAgLy8gYHN1YnNjcmlwdGlvbnNgIFNldCBpcyBjYXB0dXJlZCBhdCBzZXNzaW9uLWNyZWF0aW9uIHRpbWUgYW5kXG4gICAgICAgIC8vIHNoYXJlZCB3aXRoIHRoZSBTZXNzaW9uRW50cnkgc28gYG5vdGlmeVJlc291cmNlVXBkYXRlZGBcbiAgICAgICAgLy8gY2FuIGl0ZXJhdGUgc2Vzc2lvbnMgYW5kIGNoZWNrIG1lbWJlcnNoaXAgd2l0aG91dCBhIHNlY29uZFxuICAgICAgICAvLyBsb29rdXAuXG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihTdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5hZGQodXJpKTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFVuc3Vic2NyaWJlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMuZGVsZXRlKHVyaSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHVuc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHNka1NlcnZlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBULVYyNS0zOiBkaXNwYXRjaCBhIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgdG8gZXZlcnlcbiAgICAgKiBzZXNzaW9uIHRoYXQgcHJldmlvdXNseSBjYWxsZWQgcmVzb3VyY2VzL3N1YnNjcmliZSBvbiB0aGlzIFVSSS5cbiAgICAgKiBDYWxsZWQgYnkgQnJvYWRjYXN0QnJpZGdlIGFmdGVyIGl0cyBwZXItVVJJIGRlYm91bmNlIGZpcmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgbm90aWZ5UmVzb3VyY2VVcGRhdGVkKHVyaTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGxldCBwdXNoZWQgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgaWYgKCFzZXNzaW9uLnN1YnNjcmlwdGlvbnMuaGFzKHVyaSkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnNka1NlcnZlci5ub3RpZmljYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkJyxcbiAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7IHVyaSB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHB1c2hlZCArPSAxO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gbm90aWZpY2F0aW9uIHB1c2ggZmFpbGVkIGZvciAke3VyaX06YCwgZXJyPy5tZXNzYWdlID8/IGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHB1c2hlZCA+IDApIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gcmVzb3VyY2VzL3VwZGF0ZWQgJHt1cml9IOKGkiAke3B1c2hlZH0gc2Vzc2lvbihzKWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVC1QMS01OiBUb29sUmVzcG9uc2Ug4oaSIE1DUCBDYWxsVG9vbFJlc3VsdC4gRmFpbHVyZXMgY2FycnkgdGhlIGVycm9yXG4gICAgLy8gbWVzc2FnZSBpbiB0ZXh0IGNvbnRlbnQgKyBpc0Vycm9yLiBTdWNjZXNzZXMga2VlcCBKU09OLnN0cmluZ2lmeShyZXN1bHQpXG4gICAgLy8gaW4gdGV4dCAoYmFjay1jb21wYXQpIGFuZCB0aGUgcGFyc2VkIG9iamVjdCBpbiBzdHJ1Y3R1cmVkQ29udGVudC5cbiAgICBwcml2YXRlIGJ1aWxkVG9vbFJlc3VsdChyZXN1bHQ6IGFueSkge1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgY29uc3QgbXNnID0gcmVzdWx0LmVycm9yID8/IHJlc3VsdC5tZXNzYWdlID8/ICdUb29sIGZhaWxlZCc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBKU09OLnN0cmluZ2lmeShtc2cpIH1dLFxuICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRleHQgPSB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XG4gICAgICAgIGNvbnN0IG91dDogeyBjb250ZW50OiBBcnJheTx7IHR5cGU6ICd0ZXh0JzsgdGV4dDogc3RyaW5nIH0+OyBzdHJ1Y3R1cmVkQ29udGVudD86IGFueSB9ID0ge1xuICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dLFxuICAgICAgICB9O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBvdXQuc3RydWN0dXJlZENvbnRlbnQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnW01DUFNlcnZlcl0gU2VydmVyIGlzIGFscmVhZHkgcnVubmluZycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXR1cFRvb2xzKCk7XG5cbiAgICAgICAgY29uc3QgeyBwb3J0IH0gPSB0aGlzLnNldHRpbmdzO1xuICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gU3RhcnRpbmcgSFRUUCBzZXJ2ZXIgb24gcG9ydCAke3BvcnR9Li4uYCk7XG4gICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKHRoaXMuaGFuZGxlSHR0cFJlcXVlc3QuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5saXN0ZW4ocG9ydCwgJzEyNy4wLjAuMScsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0g4pyFIEhUVFAgc2VydmVyIHN0YXJ0ZWQgb24gaHR0cDovLzEyNy4wLjAuMToke3BvcnR9YCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIEhlYWx0aCBjaGVjazogaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L2hlYWx0aGApO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBNQ1AgZW5kcG9pbnQ6ICBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbWNwYCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLm9uKCdlcnJvcicsIChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0g4p2MIEZhaWxlZCB0byBzdGFydCBzZXJ2ZXI6JywgZXJyKTtcbiAgICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoYFtNQ1BTZXJ2ZXJdIFBvcnQgJHtwb3J0fSBpcyBhbHJlYWR5IGluIHVzZS4gUGxlYXNlIGNoYW5nZSB0aGUgcG9ydCBpbiBzZXR0aW5ncy5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gc2V0SW50ZXJ2YWwga2VlcHMgdGhlIE5vZGUgZXZlbnQgbG9vcCBhbGl2ZTsgdW5yZWYgc28gd2UgZG9uJ3RcbiAgICAgICAgLy8gYmxvY2sgZXh0ZW5zaW9uIHRlYXJkb3duIGlmIHN0b3AoKSBzb21laG93IGRvZXNuJ3QgcnVuLlxuICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHRoaXMuc3dlZXBJZGxlU2Vzc2lvbnMoKSwgU0VTU0lPTl9DTEVBTlVQX0lOVEVSVkFMX01TKTtcbiAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwudW5yZWY/LigpO1xuXG4gICAgICAgIC8vIFQtVjI1LTM6IHNwaW4gdXAgdGhlIGNvY29zIGJyb2FkY2FzdCDihpIgTUNQIG5vdGlmaWNhdGlvbnMgYnJpZGdlLlxuICAgICAgICAvLyBEaXNhYmxlZCBvdXRzaWRlIHRoZSBlZGl0b3IgaG9zdCAoZS5nLiBoZWFkbGVzcyBzbW9rZSBydW5zKVxuICAgICAgICAvLyBiZWNhdXNlIEVkaXRvci5NZXNzYWdlLl9fcHJvdGVjdGVkX18gaXNuJ3QgYXZhaWxhYmxlIHRoZXJlO1xuICAgICAgICAvLyBCcm9hZGNhc3RCcmlkZ2Uuc3RhcnQoKSBkZXRlY3RzIHRoaXMgYW5kIGxvZ3MgYSB3YXJuaW5nLlxuICAgICAgICB0aGlzLmJyb2FkY2FzdEJyaWRnZS5zdGFydCgodXJpKSA9PiB0aGlzLm5vdGlmeVJlc291cmNlVXBkYXRlZCh1cmkpKTtcblxuICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0g8J+agCBNQ1AgU2VydmVyIHJlYWR5ICgke3RoaXMudG9vbHNMaXN0Lmxlbmd0aH0gdG9vbHMpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzd2VlcElkbGVTZXNzaW9ucygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbnMuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gU0VTU0lPTl9JRExFX1RJTUVPVVRfTVM7XG4gICAgICAgIGNvbnN0IHN0YWxlOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMuc2Vzc2lvbnMpIHtcbiAgICAgICAgICAgIGlmIChlbnRyeS5sYXN0QWN0aXZpdHlBdCA8IGN1dG9mZikgc3RhbGUucHVzaChpZCk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBpZCBvZiBzdGFsZSkge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLnNlc3Npb25zLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoIWVudHJ5KSBjb250aW51ZTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIGVudHJ5LnRyYW5zcG9ydC5jbG9zZSgpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oYFtNQ1BTZXJ2ZXJdIHN3ZWVwIGNsb3NlIGVycm9yIGZvciAke2lkfTpgLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHN3ZXB0IGlkbGUgc2Vzc2lvbjogJHtpZH0gKHJlbWFpbmluZzogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXR1cFRvb2xzKCk6IHZvaWQge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbmV3IGxpc3QgbG9jYWxseSBhbmQgb25seSBzd2FwIG9uY2UgaXQncyByZWFkeSwgc28gdGhhdFxuICAgICAgICAvLyBhIGNvbmN1cnJlbnQgTGlzdFRvb2xzUmVxdWVzdCBjYW4gbmV2ZXIgb2JzZXJ2ZSBhbiBlbXB0eSBsaXN0LlxuICAgICAgICBjb25zdCBlbmFibGVkRmlsdGVyID0gdGhpcy5lbmFibGVkVG9vbHMubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBuZXcgU2V0KHRoaXMuZW5hYmxlZFRvb2xzLm1hcCh0ID0+IGAke3QuY2F0ZWdvcnl9XyR7dC5uYW1lfWApKVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGNvbnN0IG5leHQ6IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBbY2F0ZWdvcnksIHRvb2xTZXRdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMudG9vbHMpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnFOYW1lID0gYCR7Y2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWA7XG4gICAgICAgICAgICAgICAgaWYgKGVuYWJsZWRGaWx0ZXIgJiYgIWVuYWJsZWRGaWx0ZXIuaGFzKGZxTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIC8vIFQtVjIzLTE6IHRhZyBldmVyeSBub24tcHJpbWFyeSB0b29sIFtzcGVjaWFsaXN0XSBzbyBBSSBwcmVmZXJzXG4gICAgICAgICAgICAgICAgLy8gZXhlY3V0ZV9qYXZhc2NyaXB0IGZvciBjb21wb3VuZCBvcGVyYXRpb25zLiBUaGUgdHdvIGV4ZWN1dGVfKlxuICAgICAgICAgICAgICAgIC8vIHRvb2xzIGFscmVhZHkgY2FycnkgdGhlaXIgb3duIFtwcmltYXJ5XS9bY29tcGF0XSBwcmVmaXggaW5cbiAgICAgICAgICAgICAgICAvLyB0aGVpciBkZXNjcmlwdGlvbiB0ZXh0IOKAlCBsZWF2ZSB0aG9zZSBhbG9uZS5cbiAgICAgICAgICAgICAgICBjb25zdCBkZXNjID0gdG9vbC5kZXNjcmlwdGlvbjtcbiAgICAgICAgICAgICAgICBjb25zdCBhbHJlYWR5VGFnZ2VkID0gZGVzYy5zdGFydHNXaXRoKCdbcHJpbWFyeV0nKSB8fCBkZXNjLnN0YXJ0c1dpdGgoJ1tjb21wYXRdJykgfHwgZGVzYy5zdGFydHNXaXRoKCdbc3BlY2lhbGlzdF0nKTtcbiAgICAgICAgICAgICAgICBuZXh0LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBmcU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBhbHJlYWR5VGFnZ2VkID8gZGVzYyA6IGBbc3BlY2lhbGlzdF0gJHtkZXNjfWAsXG4gICAgICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0b29sLmlucHV0U2NoZW1hLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9vbHNMaXN0ID0gbmV4dDtcblxuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFNldHVwIHRvb2xzOiAke3RoaXMudG9vbHNMaXN0Lmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVUb29sQ2FsbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICBjb25zdCBbY2F0ZWdvcnksIC4uLnJlc3RdID0gdG9vbE5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgY29uc3QgZXhlY3V0b3IgPSB0aGlzLnRvb2xzW2NhdGVnb3J5XTtcbiAgICAgICAgaWYgKCFleGVjdXRvcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleGVjdXRvci5leGVjdXRlKHJlc3Quam9pbignXycpLCBhcmdzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29sczogYW55W10pOiB2b2lkIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVcGRhdGluZyBlbmFibGVkIHRvb2xzOiAke2VuYWJsZWRUb29scy5sZW5ndGh9IHRvb2xzYCk7XG4gICAgICAgIHRoaXMuZW5hYmxlZFRvb2xzID0gZW5hYmxlZFRvb2xzO1xuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcbiAgICAgICAgLy8gTm90aWZ5IGFsbCBsaXZlIHNlc3Npb25zIHRoYXQgdGhlIHRvb2wgbGlzdCBjaGFuZ2VkLlxuICAgICAgICBmb3IgKGNvbnN0IHsgc2RrU2VydmVyIH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgc2RrU2VydmVyLnNlbmRUb29sTGlzdENoYW5nZWQoKS5jYXRjaCgoKSA9PiB7IC8qIHBlZXIgbWF5IGhhdmUgZHJvcHBlZCAqLyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTZXR0aW5ncygpOiBNQ1BTZXJ2ZXJTZXR0aW5ncyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlSHR0cFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFVybCA9IHVybC5wYXJzZShyZXEudXJsIHx8ICcnLCB0cnVlKTtcbiAgICAgICAgY29uc3QgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cbiAgICAgICAgLy8gQ09SUyBpcyB3aWxkY2FyZCBzbyB0aGUgQ29jb3MgQ3JlYXRvciBwYW5lbCB3ZWJ2aWV3ICh3aGljaCBsb2Fkc1xuICAgICAgICAvLyBmcm9tIGEgYGZpbGU6Ly9gIG9yIGBkZXZ0b29sczovL2Agb3JpZ2luKSBjYW4gaGl0IHRoaXMgZW5kcG9pbnQuXG4gICAgICAgIC8vIFRoZSBzZXJ2ZXIgb25seSBsaXN0ZW5zIG9uIDEyNy4wLjAuMSwgc28gZXh0ZXJuYWwgYXR0YWNrZXJzIGNhbid0XG4gICAgICAgIC8vIHJlYWNoIGl0OyB0aGUgd2lsZGNhcmQgZG9lcyBtZWFuIGFueSBsb2NhbCB3ZWIgcGFnZSBpbiB0aGUgdXNlcidzXG4gICAgICAgIC8vIGJyb3dzZXIgY291bGQgcHJvYmUgaXQsIHdoaWNoIGlzIGFjY2VwdGFibGUgZm9yIGEgZGV2ZWxvcGVyIHRvb2wuXG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsICcqJyk7XG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULCBQT1NULCBPUFRJT05TLCBERUxFVEUnKTtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24sIG1jcC1zZXNzaW9uLWlkLCBtY3AtcHJvdG9jb2wtdmVyc2lvbicpO1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdtY3Atc2Vzc2lvbi1pZCcpO1xuXG4gICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjA0KTtcbiAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvbWNwJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlTWNwUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2hlYWx0aCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICdvaycsIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5sZW5ndGggfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvdG9vbHMnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgdG9vbHM6IHRoaXMuZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9hcGkvJykgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcSwgcmVzLCBwYXRobmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ05vdCBmb3VuZCcgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIEhUVFAgcmVxdWVzdCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJywgZGV0YWlsczogZXJyb3I/Lm1lc3NhZ2UgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSByZXEuaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gR0VUIChzZXJ2ZXItaW5pdGlhdGVkIFNTRSkgYW5kIERFTEVURSAoZXhwbGljaXQgc2Vzc2lvbiBjbG9zZSkgYm90aFxuICAgICAgICAvLyByZXF1aXJlIGFuIGV4aXN0aW5nIHNlc3Npb24uIFBlciBTdHJlYW1hYmxlIEhUVFAgc3BlYywgR0VUIHdpdGhvdXRcbiAgICAgICAgLy8gc2Vzc2lvbiBpcyBcIm1ldGhvZCBub3QgYWxsb3dlZFwiOyBERUxFVEUgd2l0aG91dCBzZXNzaW9uIGlzIFwibm90IGZvdW5kXCIuXG4gICAgICAgIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gc2Vzc2lvbklkID8gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghZW50cnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0dldCA9IHJlcS5tZXRob2QgPT09ICdHRVQnO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoaXNHZXQgPyA0MDUgOiA0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsIGlzR2V0XG4gICAgICAgICAgICAgICAgICAgID8gJ01ldGhvZCBub3QgYWxsb3dlZCB3aXRob3V0IGFjdGl2ZSBzZXNzaW9uJ1xuICAgICAgICAgICAgICAgICAgICA6ICdTZXNzaW9uIG5vdCBmb3VuZCcpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbnRyeS5sYXN0QWN0aXZpdHlBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBlbnRyeS50cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQT1NUOiByZWFkIGJvZHkgb25jZSBzbyB3ZSBjYW4gZGV0ZWN0IGluaXRpYWxpemUgYmVmb3JlIGRpc3BhdGNoLlxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgbGV0IHBhcnNlZEJvZHk6IGFueTtcbiAgICAgICAgaWYgKGJvZHkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwYXJzZWRCb2R5ID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyNzAwLFxuICAgICAgICAgICAgICAgICAgICBgUGFyc2UgZXJyb3I6ICR7cGFyc2VFcnJvci5tZXNzYWdlfS4gQm9keTogJHtib2R5LnN1YnN0cmluZygwLCAyMDApfWApKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZyA9IHNlc3Npb25JZCA/IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgZXhpc3RpbmcubGFzdEFjdGl2aXR5QXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgZXhpc3RpbmcudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IHNlc3Npb24gbXVzdCBjb21lIHdpdGggYW4gaW5pdGlhbGl6ZSByZXF1ZXN0LlxuICAgICAgICBpZiAoIWlzSW5pdGlhbGl6ZVJlcXVlc3QocGFyc2VkQm9keSkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsICdCYWQgUmVxdWVzdDogTm8gdmFsaWQgc2Vzc2lvbiBJRCBwcm92aWRlZCcpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBTZXJ2ZXIgZmlyc3Qgc28gdGhlIHRyYW5zcG9ydCBjYWxsYmFjayBjbG9zdXJlIGNhcHR1cmVzXG4gICAgICAgIC8vIGFuIGFscmVhZHktaW5pdGlhbGl6ZWQgYmluZGluZyAoYXZvaWRzIFREWi1zdHlsZSBvcmRlcmluZyBzdXJwcmlzZXMpLlxuICAgICAgICAvLyBULVYyNS0zOiBwcmUtY3JlYXRlIHRoZSBwZXItc2Vzc2lvbiBzdWJzY3JpcHRpb25zIFNldCBhbmQgcGFzcyBpdFxuICAgICAgICAvLyBpbnRvIGJ1aWxkU2RrU2VydmVyIHNvIHRoZSBTdWJzY3JpYmUvVW5zdWJzY3JpYmUgaGFuZGxlcnMgYW5kIHRoZVxuICAgICAgICAvLyBTZXNzaW9uRW50cnkgYm90aCByZWZlcmVuY2UgdGhlIHNhbWUgU2V0IGluc3RhbmNlLlxuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICAgIGNvbnN0IHNka1NlcnZlciA9IHRoaXMuYnVpbGRTZGtTZXJ2ZXIoc3Vic2NyaXB0aW9ucyk7XG4gICAgICAgIGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCh7XG4gICAgICAgICAgICBzZXNzaW9uSWRHZW5lcmF0b3I6ICgpID0+IHJhbmRvbVVVSUQoKSxcbiAgICAgICAgICAgIGVuYWJsZUpzb25SZXNwb25zZTogdHJ1ZSxcbiAgICAgICAgICAgIG9uc2Vzc2lvbmluaXRpYWxpemVkOiAoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb25zLnNldChpZCwgeyB0cmFuc3BvcnQsIHNka1NlcnZlciwgbGFzdEFjdGl2aXR5QXQ6IERhdGUubm93KCksIHN1YnNjcmlwdGlvbnMgfSk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzZXNzaW9uIGluaXRpYWxpemVkOiAke2lkfSAodG90YWw6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbnNlc3Npb25jbG9zZWQ6IChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHNlc3Npb24gY2xvc2VkOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgYXdhaXQgc2RrU2VydmVyLmNvbm5lY3QodHJhbnNwb3J0KTtcbiAgICAgICAgYXdhaXQgdHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy5jbGVhbnVwSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5jbGVhbnVwSW50ZXJ2YWwpO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIC8vIFQtVjI1LTM6IHRlYXIgZG93biB0aGUgYnJpZGdlIGJlZm9yZSBjbG9zaW5nIHNlc3Npb25zIHNvIGFueVxuICAgICAgICAvLyBpbi1mbGlnaHQgbm90aWZpY2F0aW9uIHRpbWVycyBhcmUgY2xlYXJlZCBhbmQgbm8gbGlzdGVuZXJzXG4gICAgICAgIC8vIHRyeSB0byBwdXNoIHRvIGNsb3NlZCB0cmFuc3BvcnRzLlxuICAgICAgICB0aGlzLmJyb2FkY2FzdEJyaWRnZS5zdG9wKCk7XG4gICAgICAgIGZvciAoY29uc3QgeyB0cmFuc3BvcnQgfSBvZiB0aGlzLnNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRyYW5zcG9ydC5jbG9zZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQU2VydmVyXSB0cmFuc3BvcnQgY2xvc2UgZXJyb3I6JywgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9ucy5jbGVhcigpO1xuICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAvLyBjbG9zZSgpIG9ubHkgcmVmdXNlcyBORVcgY29ubmVjdGlvbnM7IGtlZXAtYWxpdmUgc29ja2V0cyBzdGF5XG4gICAgICAgICAgICAvLyBvcGVuIGFuZCB3b3VsZCBibG9jayBjbG9zZSgpIGZvcmV2ZXIuIEZvcmNlIHRoZW0gdG8gZHJvcCB0b28uXG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucz8uKCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLmNsb3NlKCgpID0+IHJlc29sdmUoKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IG51bGw7XG4gICAgICAgICAgICBsb2dnZXIuaW5mbygnW01DUFNlcnZlcl0gSFRUUCBzZXJ2ZXIgc3RvcHBlZCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFN0YXR1cygpOiBTZXJ2ZXJTdGF0dXMge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcnVubmluZzogISF0aGlzLmh0dHBTZXJ2ZXIsXG4gICAgICAgICAgICBwb3J0OiB0aGlzLnNldHRpbmdzLnBvcnQsXG4gICAgICAgICAgICBjbGllbnRzOiB0aGlzLnNlc3Npb25zLnNpemUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcGF0aG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBwYXRoUGFydHMgPSBwYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihwID0+IHApO1xuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIEFQSSBwYXRoLiBVc2UgL2FwaS97Y2F0ZWdvcnl9L3t0b29sX25hbWV9JyB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbFRvb2xOYW1lID0gYCR7cGF0aFBhcnRzWzFdfV8ke3BhdGhQYXJ0c1syXX1gO1xuXG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBsZXQgcGFyYW1zOiBhbnk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwYXJhbXMgPSBib2R5ID8gSlNPTi5wYXJzZShib2R5KSA6IHt9O1xuICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBlcnJvcjogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICAgICAgICAgIGRldGFpbHM6IHBhcnNlRXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZEJvZHk6IGJvZHkuc3Vic3RyaW5nKDAsIDIwMCksXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwoZnVsbFRvb2xOYW1lLCBwYXJhbXMpO1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCB0b29sOiBmdWxsVG9vbE5hbWUsIHJlc3VsdCB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0gU2ltcGxlIEFQSSBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgdG9vbDogcGF0aG5hbWUgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTaW1wbGlmaWVkVG9vbHNMaXN0KCk6IGFueVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9vbHNMaXN0Lm1hcCh0b29sID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gdG9vbC5uYW1lLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHBhcnRzWzBdO1xuICAgICAgICAgICAgY29uc3QgdG9vbE5hbWUgPSBwYXJ0cy5zbGljZSgxKS5qb2luKCdfJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICB0b29sTmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBhcGlQYXRoOiBgL2FwaS8ke2NhdGVnb3J5fS8ke3Rvb2xOYW1lfWAsXG4gICAgICAgICAgICAgICAgY3VybEV4YW1wbGU6IHRoaXMuZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeSwgdG9vbE5hbWUsIHRvb2wuaW5wdXRTY2hlbWEpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZUN1cmxFeGFtcGxlKGNhdGVnb3J5OiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIHNjaGVtYTogYW55KTogc3RyaW5nIHtcbiAgICAgICAgY29uc3Qgc2FtcGxlUGFyYW1zID0gdGhpcy5nZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWEpO1xuICAgICAgICBjb25zdCBqc29uU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2FtcGxlUGFyYW1zLCBudWxsLCAyKTtcbiAgICAgICAgcmV0dXJuIGBjdXJsIC1YIFBPU1QgaHR0cDovLzEyNy4wLjAuMToke3RoaXMuc2V0dGluZ3MucG9ydH0vYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9IFxcXFxcbiAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxcXG4gIC1kICcke2pzb25TdHJpbmd9J2A7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWE6IGFueSk6IGFueSB7XG4gICAgICAgIGlmICghc2NoZW1hIHx8ICFzY2hlbWEucHJvcGVydGllcykgcmV0dXJuIHt9O1xuICAgICAgICBjb25zdCBzYW1wbGU6IGFueSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzIGFzIGFueSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BTY2hlbWEgPSBwcm9wIGFzIGFueTtcbiAgICAgICAgICAgIHN3aXRjaCAocHJvcFNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gJ2V4YW1wbGVfc3RyaW5nJztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gNDI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSAnZXhhbXBsZV92YWx1ZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNhbXBsZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLnVwZGF0aW5nKSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUFNlcnZlcl0gdXBkYXRlU2V0dGluZ3MgaWdub3JlZCDigJQgYW5vdGhlciB1cGRhdGUgaW4gcHJvZ3Jlc3MnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgICAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogcGFuZWwgdG9nZ2xlcyBmb3IgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWwgbXVzdFxuICAgICAgICAgICAgLy8gdGFrZSBlZmZlY3QgaW1tZWRpYXRlbHkuIFdpdGhvdXQgdGhpcyByZS1hcHBseSwgZGlzYWJsaW5nIHRoZVxuICAgICAgICAgICAgLy8gc2V0dGluZyBhZnRlciBlbmFibGUgd291bGQgbGVhdmUgdGhlIHJ1bnRpbWUgZmxhZyBPTiB1bnRpbCB0aGVcbiAgICAgICAgICAgIC8vIGVudGlyZSBleHRlbnNpb24gcmVsb2FkcyDigJQgYSBzZWN1cml0eS1yZWxldmFudCBnYXAgYmVjYXVzZSB0aGVcbiAgICAgICAgICAgIC8vIGVkaXRvci1jb250ZXh0IGV2YWwgd291bGQga2VlcCBhY2NlcHRpbmcgQUktZ2VuZXJhdGVkIGhvc3Qtc2lkZVxuICAgICAgICAgICAgLy8gY29kZSBkZXNwaXRlIHRoZSB1c2VyJ3MgcGFuZWwgY2hvaWNlLlxuICAgICAgICAgICAgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKHNldHRpbmdzLmVuYWJsZUVkaXRvckNvbnRleHRFdmFsID8/IGZhbHNlKTtcbiAgICAgICAgICAgIC8vIHYyLjQuOCBBMzogcmUtYXBwbHkgc2NlbmUtbG9nLWNhcHR1cmUgZmxhZyBvbiBldmVyeSBzZXR0aW5nc1xuICAgICAgICAgICAgLy8gY2hhbmdlIHNvIHBhbmVsIHRvZ2dsZSB0YWtlcyBlZmZlY3QgaW1tZWRpYXRlbHksIG1pcnJvcmluZyB0aGVcbiAgICAgICAgICAgIC8vIGVkaXRvckNvbnRleHRFdmFsIHJlLWFwcGx5IHBhdHRlcm4uXG4gICAgICAgICAgICBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkKHNldHRpbmdzLmVuYWJsZVNjZW5lTG9nQ2FwdHVyZSA/PyB0cnVlKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0aW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRCb2R5KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGxldCBib2R5ID0gJyc7XG4gICAgICAgIHJlcS5vbignZGF0YScsIGNodW5rID0+IHsgYm9keSArPSBjaHVuay50b1N0cmluZygpOyB9KTtcbiAgICAgICAgcmVxLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKGJvZHkpKTtcbiAgICAgICAgcmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgfSk7XG59XG4iXX0=