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
const registry_2 = require("./prompts/registry");
const game_command_queue_1 = require("./lib/game-command-queue");
const SERVER_NAME = 'cocos-mcp-server';
// v2.5.1 round-1 review fix (gemini 🔴): keep this in sync with package.json's
// version on every minor/major bump. SDK Server initialize response carries
// this string; clients see it during MCP handshake. Drift since v2.0.0 has
// been confusing review rounds and live-test verification.
const SERVER_VERSION = '2.5.1';
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
        // T-V25-4: prompts registry baked with project context that's
        // resolved lazily — Editor.Project may not be ready at MCPServer
        // construction time but is reliably available when prompts/get
        // is called.
        this.prompts = (0, registry_2.createPromptRegistry)(() => ({
            projectName: this.resolveProjectName(),
            projectPath: this.resolveProjectPath(),
        }));
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
                // T-V25-4 (T-P3-2): 4 baked prompt templates; no
                // hot-reload yet so listChanged stays false.
                prompts: { listChanged: false },
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
        // T-V25-4: prompts/list + prompts/get. Stateless (no session
        // affinity needed); rendered text bakes in project context at
        // call time so a project rename is reflected immediately.
        sdkServer.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => ({
            prompts: this.prompts.list(),
        }));
        sdkServer.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
            const { name } = request.params;
            const content = this.prompts.get(name);
            if (!content) {
                // v2.5.1 round-1 review fix (codex 🔴 + claude 🟡): unknown
                // prompt names must surface as JSON-RPC errors per MCP spec,
                // not as successful "Prompt not found" content bodies.
                // SDK's RequestHandler converts thrown Errors into
                // -32603 Internal Error by default; we throw a plain Error
                // with a helpful message including the available names.
                throw new Error(`Unknown prompt: ${name}. Available: ${this.prompts.knownNames().join(', ')}`);
            }
            // SDK's GetPromptResult type carries a discriminated union
            // (one branch requires a `task` field). Our content matches
            // the simple-prompt branch; cast through unknown to satisfy
            // the structural check without buying into the task branch.
            return content;
        });
        return sdkServer;
    }
    resolveProjectName() {
        var _a, _b;
        try {
            const path = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
            if (path) {
                // Last path segment usually the project folder name; fall back
                // to "(unknown)" if Editor isn't ready.
                const parts = path.split(/[\\/]/).filter(Boolean);
                return (_b = parts[parts.length - 1]) !== null && _b !== void 0 ? _b : '(unknown)';
            }
        }
        catch ( /* swallow */_c) { /* swallow */ }
        return '(unknown)';
    }
    resolveProjectPath() {
        var _a, _b;
        try {
            return (_b = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : '(unknown)';
        }
        catch (_c) {
            return '(unknown)';
        }
    }
    /**
     * T-V25-3: dispatch a notifications/resources/updated to every
     * session that previously called resources/subscribe on this URI.
     * Called by BroadcastBridge after its per-URI debounce fires.
     */
    notifyResourceUpdated(uri) {
        // v2.5.1 round-1 review fix (codex 🔴): sdkServer.notification(...)
        // returns a Promise. Without await/catch, transport-level failures
        // become unhandled rejections (Node prints scary "UnhandledPromiseRejection"
        // and may exit on --unhandled-rejections=strict). Use void+catch so
        // the loop continues even if one session's transport is half-closed.
        // Snapshot session list (claude 🟡) so a session removed mid-iteration
        // doesn't skew the queued notifications.
        const targets = Array.from(this.sessions.values()).filter(s => s.subscriptions.has(uri));
        if (targets.length === 0)
            return;
        for (const session of targets) {
            void session.sdkServer.notification({
                method: 'notifications/resources/updated',
                params: { uri },
            }).catch((err) => {
                var _a;
                log_1.logger.warn(`[MCPServer] notification push failed for ${uri}:`, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
            });
        }
        log_1.logger.debug(`[MCPServer] resources/updated ${uri} → ${targets.length} session(s)`);
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
                // T-V26-1: include GameDebugClient liveness so AI / user can
                // verify the polling client is up before issuing
                // debug_game_command.
                const gameClient = (0, game_command_queue_1.getClientStatus)();
                res.end(JSON.stringify({
                    status: 'ok',
                    tools: this.toolsList.length,
                    gameClient: {
                        connected: gameClient.connected,
                        lastPollAt: gameClient.lastPollAt,
                    },
                }));
                return;
            }
            // T-V26-1: GameDebugClient polls this for the next pending command.
            // Single-flight queue lives in lib/game-command-queue.ts.
            if (pathname === '/game/command' && req.method === 'GET') {
                const cmd = (0, game_command_queue_1.consumePendingCommand)();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cmd !== null && cmd !== void 0 ? cmd : null));
                return;
            }
            if (pathname === '/game/result' && req.method === 'POST') {
                const body = await readBody(req);
                let parsed;
                try {
                    parsed = JSON.parse(body);
                }
                catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: `Invalid JSON: ${err.message}` }));
                    return;
                }
                if (!parsed || typeof parsed.id !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'expected {id, success, data?, error?}' }));
                    return;
                }
                const accepted = (0, game_command_queue_1.setCommandResult)(parsed);
                res.writeHead(accepted.ok ? 204 : 409, { 'Content-Type': 'application/json' });
                res.end(accepted.ok ? '' : JSON.stringify({ ok: false, error: accepted.reason }));
                return;
            }
            if (pathname === '/game/status' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify((0, game_command_queue_1.getClientStatus)()));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFXNEM7QUFFNUMsbUNBQXVEO0FBQ3ZELHVEQUE2RjtBQUU3RixtREFBZ0Y7QUFDaEYsNkRBQXlEO0FBQ3pELGlEQUEwRTtBQUMxRSxpRUFJa0M7QUFFbEMsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDdkMsK0VBQStFO0FBQy9FLDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0UsMkRBQTJEO0FBQzNELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBWTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQWdCbEIsWUFBWSxRQUEyQixFQUFFLFFBQXNCOztRQWR2RCxlQUFVLEdBQXVCLElBQUksQ0FBQztRQUN0QyxhQUFRLEdBQThCLElBQUksR0FBRyxFQUFFLENBQUM7UUFJaEQsY0FBUyxHQUFxQixFQUFFLENBQUM7UUFDakMsaUJBQVksR0FBVSxFQUFFLENB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QUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25DLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzVCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgU2VydmVyIH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvaW5kZXguanMnO1xuaW1wb3J0IHsgU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9zdHJlYW1hYmxlSHR0cC5qcyc7XG5pbXBvcnQge1xuICAgIENhbGxUb29sUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0VG9vbHNSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RSZXNvdXJjZXNSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RTY2hlbWEsXG4gICAgUmVhZFJlc291cmNlUmVxdWVzdFNjaGVtYSxcbiAgICBTdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLFxuICAgIFVuc3Vic2NyaWJlUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UHJvbXB0c1JlcXVlc3RTY2hlbWEsXG4gICAgR2V0UHJvbXB0UmVxdWVzdFNjaGVtYSxcbiAgICBpc0luaXRpYWxpemVSZXF1ZXN0LFxufSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJztcbmltcG9ydCB7IE1DUFNlcnZlclNldHRpbmdzLCBTZXJ2ZXJTdGF0dXMsIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBzZXREZWJ1Z0xvZ0VuYWJsZWQsIGxvZ2dlciB9IGZyb20gJy4vbGliL2xvZyc7XG5pbXBvcnQgeyBzZXRFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQsIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQgfSBmcm9tICcuL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IFRvb2xSZWdpc3RyeSB9IGZyb20gJy4vdG9vbHMvcmVnaXN0cnknO1xuaW1wb3J0IHsgUmVzb3VyY2VSZWdpc3RyeSwgY3JlYXRlUmVzb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4vcmVzb3VyY2VzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IEJyb2FkY2FzdEJyaWRnZSB9IGZyb20gJy4vbGliL2Jyb2FkY2FzdC1icmlkZ2UnO1xuaW1wb3J0IHsgUHJvbXB0UmVnaXN0cnksIGNyZWF0ZVByb21wdFJlZ2lzdHJ5IH0gZnJvbSAnLi9wcm9tcHRzL3JlZ2lzdHJ5JztcbmltcG9ydCB7XG4gICAgY29uc3VtZVBlbmRpbmdDb21tYW5kLFxuICAgIHNldENvbW1hbmRSZXN1bHQsXG4gICAgZ2V0Q2xpZW50U3RhdHVzLFxufSBmcm9tICcuL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuXG5jb25zdCBTRVJWRVJfTkFNRSA9ICdjb2Nvcy1tY3Atc2VydmVyJztcbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGdlbWluaSDwn5S0KToga2VlcCB0aGlzIGluIHN5bmMgd2l0aCBwYWNrYWdlLmpzb24nc1xuLy8gdmVyc2lvbiBvbiBldmVyeSBtaW5vci9tYWpvciBidW1wLiBTREsgU2VydmVyIGluaXRpYWxpemUgcmVzcG9uc2UgY2Fycmllc1xuLy8gdGhpcyBzdHJpbmc7IGNsaWVudHMgc2VlIGl0IGR1cmluZyBNQ1AgaGFuZHNoYWtlLiBEcmlmdCBzaW5jZSB2Mi4wLjAgaGFzXG4vLyBiZWVuIGNvbmZ1c2luZyByZXZpZXcgcm91bmRzIGFuZCBsaXZlLXRlc3QgdmVyaWZpY2F0aW9uLlxuY29uc3QgU0VSVkVSX1ZFUlNJT04gPSAnMi41LjEnO1xuXG4vLyBJZGxlIHNlc3Npb24gc3dlZXA6IGRyb3Agc2Vzc2lvbnMgdGhhdCBoYXZlbid0IGJlZW4gdG91Y2hlZCBpbiB0aGlzIG1hbnkgbXMuXG4vLyBTZXQgY29uc2VydmF0aXZlbHkgbG9uZyBmb3IgZWRpdG9yIHVzYWdlIHdoZXJlIGEgZGV2ZWxvcGVyIG1heSBwYXVzZSB3b3JrLlxuY29uc3QgU0VTU0lPTl9JRExFX1RJTUVPVVRfTVMgPSAzMCAqIDYwICogMTAwMDtcbmNvbnN0IFNFU1NJT05fQ0xFQU5VUF9JTlRFUlZBTF9NUyA9IDYwICogMTAwMDtcblxuaW50ZXJmYWNlIFNlc3Npb25FbnRyeSB7XG4gICAgdHJhbnNwb3J0OiBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydDtcbiAgICBzZGtTZXJ2ZXI6IFNlcnZlcjtcbiAgICBsYXN0QWN0aXZpdHlBdDogbnVtYmVyO1xuICAgIC8vIFQtVjI1LTM6IHBlci1zZXNzaW9uIHJlc291cmNlIFVSSSBzdWJzY3JpcHRpb25zIGZvclxuICAgIC8vIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgcHVzaC4gRW1wdHkgc2V0IOKGkiBzZXNzaW9uXG4gICAgLy8gZ2V0cyBubyBub3RpZmljYXRpb25zIGV2ZW4gaWYgdGhlIGJyaWRnZSBmaXJlcy5cbiAgICBzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPjtcbn1cblxuZnVuY3Rpb24ganNvblJwY0Vycm9yKGNvZGU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBqc29ucnBjOiAnMi4wJywgZXJyb3I6IHsgY29kZSwgbWVzc2FnZSB9LCBpZDogbnVsbCB9KTtcbn1cblxuLyoqXG4gKiBNQ1Agc2VydmVyIGJhY2tlZCBieSB0aGUgb2ZmaWNpYWwgQG1vZGVsY29udGV4dHByb3RvY29sL3NkayBTZXJ2ZXIgK1xuICogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgKHN0YXRlZnVsIG1vZGUpLlxuICpcbiAqIEVhY2ggTUNQIGNsaWVudCBnZXRzIGl0cyBvd24gU2VydmVyICsgVHJhbnNwb3J0IHBhaXIga2V5ZWQgYnlcbiAqIGBtY3Atc2Vzc2lvbi1pZGAuIEluaXRpYWxpemUgcmVxdWVzdHMgd2l0aCBubyBzZXNzaW9uIGlkIG1pbnQgYSBuZXcgcGFpci5cbiAqIFJFU1QgZW5kcG9pbnRzICgvaGVhbHRoLCAvYXBpL3Rvb2xzLCAvYXBpL3tjYXR9L3t0b29sfSkgc2hhcmUgdGhlIHNhbWVcbiAqIHVuZGVybHlpbmcgaHR0cC5TZXJ2ZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBNQ1BTZXJ2ZXIge1xuICAgIHByaXZhdGUgc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzO1xuICAgIHByaXZhdGUgaHR0cFNlcnZlcjogaHR0cC5TZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHNlc3Npb25zOiBNYXA8c3RyaW5nLCBTZXNzaW9uRW50cnk+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgdG9vbHM6IFRvb2xSZWdpc3RyeTtcbiAgICBwcml2YXRlIHJlc291cmNlczogUmVzb3VyY2VSZWdpc3RyeTtcbiAgICBwcml2YXRlIHByb21wdHM6IFByb21wdFJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgdG9vbHNMaXN0OiBUb29sRGVmaW5pdGlvbltdID0gW107XG4gICAgcHJpdmF0ZSBlbmFibGVkVG9vbHM6IGFueVtdID0gW107XG4gICAgcHJpdmF0ZSBjbGVhbnVwSW50ZXJ2YWw6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSB1cGRhdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuICAgIC8vIFQtVjI1LTM6IGJyaWRnZSBjb2NvcyBlZGl0b3IgSVBDIGJyb2FkY2FzdHMg4oaSIE1DUFxuICAgIC8vIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQuIHN0YXJ0KCkvc3RvcCgpIGxpZmVjeWNsZVxuICAgIC8vIHRpZWQgdG8gdGhlIEhUVFAgc2VydmVyLlxuICAgIHByaXZhdGUgYnJvYWRjYXN0QnJpZGdlOiBCcm9hZGNhc3RCcmlkZ2UgPSBuZXcgQnJvYWRjYXN0QnJpZGdlKCk7XG5cbiAgICBjb25zdHJ1Y3RvcihzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MsIHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICB0aGlzLnRvb2xzID0gcmVnaXN0cnk7XG4gICAgICAgIHRoaXMucmVzb3VyY2VzID0gY3JlYXRlUmVzb3VyY2VSZWdpc3RyeShyZWdpc3RyeSk7XG4gICAgICAgIC8vIFQtVjI1LTQ6IHByb21wdHMgcmVnaXN0cnkgYmFrZWQgd2l0aCBwcm9qZWN0IGNvbnRleHQgdGhhdCdzXG4gICAgICAgIC8vIHJlc29sdmVkIGxhemlseSDigJQgRWRpdG9yLlByb2plY3QgbWF5IG5vdCBiZSByZWFkeSBhdCBNQ1BTZXJ2ZXJcbiAgICAgICAgLy8gY29uc3RydWN0aW9uIHRpbWUgYnV0IGlzIHJlbGlhYmx5IGF2YWlsYWJsZSB3aGVuIHByb21wdHMvZ2V0XG4gICAgICAgIC8vIGlzIGNhbGxlZC5cbiAgICAgICAgdGhpcy5wcm9tcHRzID0gY3JlYXRlUHJvbXB0UmVnaXN0cnkoKCkgPT4gKHtcbiAgICAgICAgICAgIHByb2plY3ROYW1lOiB0aGlzLnJlc29sdmVQcm9qZWN0TmFtZSgpLFxuICAgICAgICAgICAgcHJvamVjdFBhdGg6IHRoaXMucmVzb2x2ZVByb2plY3RQYXRoKCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2V0RGVidWdMb2dFbmFibGVkKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcbiAgICAgICAgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKHNldHRpbmdzLmVuYWJsZUVkaXRvckNvbnRleHRFdmFsID8/IGZhbHNlKTtcbiAgICAgICAgc2V0U2NlbmVMb2dDYXB0dXJlRW5hYmxlZChzZXR0aW5ncy5lbmFibGVTY2VuZUxvZ0NhcHR1cmUgPz8gdHJ1ZSk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gVXNpbmcgc2hhcmVkIHRvb2wgcmVnaXN0cnkgKCR7T2JqZWN0LmtleXMocmVnaXN0cnkpLmxlbmd0aH0gY2F0ZWdvcmllcylgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkU2RrU2VydmVyKHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+KTogU2VydmVyIHtcbiAgICAgICAgY29uc3Qgc2RrU2VydmVyID0gbmV3IFNlcnZlcihcbiAgICAgICAgICAgIHsgbmFtZTogU0VSVkVSX05BTUUsIHZlcnNpb246IFNFUlZFUl9WRVJTSU9OIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2xzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFQtVjI1LTMgKFQtUDMtMyk6IHN1YnNjcmliZSBpcyBub3cgdHJ1ZSDigJQgY2xpZW50cyBjYW5cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb3VyY2VzL3N1YnNjcmliZSB0byBhIFVSSTsgdGhlIGJyb2FkY2FzdC1icmlkZ2VcbiAgICAgICAgICAgICAgICAgICAgLy8gcHVzaGVzIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gbWFwcGVkIGNvY29zIGJyb2FkY2FzdCBmaXJlcyAoZGVib3VuY2VkIHBlciBVUkkpLlxuICAgICAgICAgICAgICAgICAgICAvLyBSRkMgNjU3MCB0ZW1wbGF0ZXMgYXJlIGltcGxpY2l0bHkgc3VwcG9ydGVkIGJ5IHJlZ2lzdGVyaW5nXG4gICAgICAgICAgICAgICAgICAgIC8vIExpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RTY2hlbWEgYmVsb3cg4oCUIE1DUCBzcGVjIGhhcyBub1xuICAgICAgICAgICAgICAgICAgICAvLyByZXNvdXJjZXMudGVtcGxhdGVzIGNhcGFiaWxpdHkgZmxhZyAoY29jb3MtY2xpJ3NcbiAgICAgICAgICAgICAgICAgICAgLy8gYHRlbXBsYXRlczogdHJ1ZWAgaXMgbm9uLXNwZWMgYW5kIHdvdWxkIGJlIHN0cmlwcGVkKS5cbiAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlLCBzdWJzY3JpYmU6IHRydWUgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gVC1WMjUtNCAoVC1QMy0yKTogNCBiYWtlZCBwcm9tcHQgdGVtcGxhdGVzOyBub1xuICAgICAgICAgICAgICAgICAgICAvLyBob3QtcmVsb2FkIHlldCBzbyBsaXN0Q2hhbmdlZCBzdGF5cyBmYWxzZS5cbiAgICAgICAgICAgICAgICAgICAgcHJvbXB0czogeyBsaXN0Q2hhbmdlZDogZmFsc2UgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5tYXAodCA9PiAoe1xuICAgICAgICAgICAgICAgIG5hbWU6IHQubmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogdC5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoQ2FsbFRvb2xSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBuYW1lLCBhcmd1bWVudHM6IGFyZ3MgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChuYW1lLCBhcmdzID8/IHt9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5idWlsZFRvb2xSZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfV0sXG4gICAgICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UmVzb3VyY2VzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHJlc291cmNlczogdGhpcy5yZXNvdXJjZXMubGlzdCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hLCBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgICAgcmVzb3VyY2VUZW1wbGF0ZXM6IHRoaXMucmVzb3VyY2VzLmxpc3RUZW1wbGF0ZXMoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoUmVhZFJlc291cmNlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc291cmNlcy5yZWFkKHVyaSk7XG4gICAgICAgICAgICByZXR1cm4geyBjb250ZW50czogW2NvbnRlbnRdIH07XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBULVYyNS0zOiBwZXItc2Vzc2lvbiByZXNvdXJjZSBzdWJzY3JpcHRpb24gaGFuZGxlcnMuIFRoZVxuICAgICAgICAvLyBgc3Vic2NyaXB0aW9uc2AgU2V0IGlzIGNhcHR1cmVkIGF0IHNlc3Npb24tY3JlYXRpb24gdGltZSBhbmRcbiAgICAgICAgLy8gc2hhcmVkIHdpdGggdGhlIFNlc3Npb25FbnRyeSBzbyBgbm90aWZ5UmVzb3VyY2VVcGRhdGVkYFxuICAgICAgICAvLyBjYW4gaXRlcmF0ZSBzZXNzaW9ucyBhbmQgY2hlY2sgbWVtYmVyc2hpcCB3aXRob3V0IGEgc2Vjb25kXG4gICAgICAgIC8vIGxvb2t1cC5cbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFN1YnNjcmliZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLmFkZCh1cmkpO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzdWJzY3JpYmUgJHt1cml9IChzZXNzaW9uIGFjdGl2ZSBzdWJzOiAke3N1YnNjcmlwdGlvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0pO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoVW5zdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5kZWxldGUodXJpKTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gdW5zdWJzY3JpYmUgJHt1cml9IChzZXNzaW9uIGFjdGl2ZSBzdWJzOiAke3N1YnNjcmlwdGlvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBULVYyNS00OiBwcm9tcHRzL2xpc3QgKyBwcm9tcHRzL2dldC4gU3RhdGVsZXNzIChubyBzZXNzaW9uXG4gICAgICAgIC8vIGFmZmluaXR5IG5lZWRlZCk7IHJlbmRlcmVkIHRleHQgYmFrZXMgaW4gcHJvamVjdCBjb250ZXh0IGF0XG4gICAgICAgIC8vIGNhbGwgdGltZSBzbyBhIHByb2plY3QgcmVuYW1lIGlzIHJlZmxlY3RlZCBpbW1lZGlhdGVseS5cbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RQcm9tcHRzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHByb21wdHM6IHRoaXMucHJvbXB0cy5saXN0KCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKEdldFByb21wdFJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IG5hbWUgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMucHJvbXB0cy5nZXQobmFtZSk7XG4gICAgICAgICAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIPCfn6EpOiB1bmtub3duXG4gICAgICAgICAgICAgICAgLy8gcHJvbXB0IG5hbWVzIG11c3Qgc3VyZmFjZSBhcyBKU09OLVJQQyBlcnJvcnMgcGVyIE1DUCBzcGVjLFxuICAgICAgICAgICAgICAgIC8vIG5vdCBhcyBzdWNjZXNzZnVsIFwiUHJvbXB0IG5vdCBmb3VuZFwiIGNvbnRlbnQgYm9kaWVzLlxuICAgICAgICAgICAgICAgIC8vIFNESydzIFJlcXVlc3RIYW5kbGVyIGNvbnZlcnRzIHRocm93biBFcnJvcnMgaW50b1xuICAgICAgICAgICAgICAgIC8vIC0zMjYwMyBJbnRlcm5hbCBFcnJvciBieSBkZWZhdWx0OyB3ZSB0aHJvdyBhIHBsYWluIEVycm9yXG4gICAgICAgICAgICAgICAgLy8gd2l0aCBhIGhlbHBmdWwgbWVzc2FnZSBpbmNsdWRpbmcgdGhlIGF2YWlsYWJsZSBuYW1lcy5cbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcHJvbXB0OiAke25hbWV9LiBBdmFpbGFibGU6ICR7dGhpcy5wcm9tcHRzLmtub3duTmFtZXMoKS5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU0RLJ3MgR2V0UHJvbXB0UmVzdWx0IHR5cGUgY2FycmllcyBhIGRpc2NyaW1pbmF0ZWQgdW5pb25cbiAgICAgICAgICAgIC8vIChvbmUgYnJhbmNoIHJlcXVpcmVzIGEgYHRhc2tgIGZpZWxkKS4gT3VyIGNvbnRlbnQgbWF0Y2hlc1xuICAgICAgICAgICAgLy8gdGhlIHNpbXBsZS1wcm9tcHQgYnJhbmNoOyBjYXN0IHRocm91Z2ggdW5rbm93biB0byBzYXRpc2Z5XG4gICAgICAgICAgICAvLyB0aGUgc3RydWN0dXJhbCBjaGVjayB3aXRob3V0IGJ1eWluZyBpbnRvIHRoZSB0YXNrIGJyYW5jaC5cbiAgICAgICAgICAgIHJldHVybiBjb250ZW50IGFzIHVua25vd24gYXMgYW55O1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHNka1NlcnZlcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TmFtZSgpOiBzdHJpbmcge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGF0aCA9IChFZGl0b3IgYXMgYW55KT8uUHJvamVjdD8ucGF0aCBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAocGF0aCkge1xuICAgICAgICAgICAgICAgIC8vIExhc3QgcGF0aCBzZWdtZW50IHVzdWFsbHkgdGhlIHByb2plY3QgZm9sZGVyIG5hbWU7IGZhbGwgYmFja1xuICAgICAgICAgICAgICAgIC8vIHRvIFwiKHVua25vd24pXCIgaWYgRWRpdG9yIGlzbid0IHJlYWR5LlxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgvW1xcXFwvXS8pLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gPz8gJyh1bmtub3duKSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cbiAgICAgICAgcmV0dXJuICcodW5rbm93biknO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RQYXRoKCk6IHN0cmluZyB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gKEVkaXRvciBhcyBhbnkpPy5Qcm9qZWN0Py5wYXRoID8/ICcodW5rbm93biknO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuICcodW5rbm93biknOyB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVC1WMjUtMzogZGlzcGF0Y2ggYSBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHRvIGV2ZXJ5XG4gICAgICogc2Vzc2lvbiB0aGF0IHByZXZpb3VzbHkgY2FsbGVkIHJlc291cmNlcy9zdWJzY3JpYmUgb24gdGhpcyBVUkkuXG4gICAgICogQ2FsbGVkIGJ5IEJyb2FkY2FzdEJyaWRnZSBhZnRlciBpdHMgcGVyLVVSSSBkZWJvdW5jZSBmaXJlcy5cbiAgICAgKi9cbiAgICBwcml2YXRlIG5vdGlmeVJlc291cmNlVXBkYXRlZCh1cmk6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0KTogc2RrU2VydmVyLm5vdGlmaWNhdGlvbiguLi4pXG4gICAgICAgIC8vIHJldHVybnMgYSBQcm9taXNlLiBXaXRob3V0IGF3YWl0L2NhdGNoLCB0cmFuc3BvcnQtbGV2ZWwgZmFpbHVyZXNcbiAgICAgICAgLy8gYmVjb21lIHVuaGFuZGxlZCByZWplY3Rpb25zIChOb2RlIHByaW50cyBzY2FyeSBcIlVuaGFuZGxlZFByb21pc2VSZWplY3Rpb25cIlxuICAgICAgICAvLyBhbmQgbWF5IGV4aXQgb24gLS11bmhhbmRsZWQtcmVqZWN0aW9ucz1zdHJpY3QpLiBVc2Ugdm9pZCtjYXRjaCBzb1xuICAgICAgICAvLyB0aGUgbG9vcCBjb250aW51ZXMgZXZlbiBpZiBvbmUgc2Vzc2lvbidzIHRyYW5zcG9ydCBpcyBoYWxmLWNsb3NlZC5cbiAgICAgICAgLy8gU25hcHNob3Qgc2Vzc2lvbiBsaXN0IChjbGF1ZGUg8J+foSkgc28gYSBzZXNzaW9uIHJlbW92ZWQgbWlkLWl0ZXJhdGlvblxuICAgICAgICAvLyBkb2Vzbid0IHNrZXcgdGhlIHF1ZXVlZCBub3RpZmljYXRpb25zLlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gQXJyYXkuZnJvbSh0aGlzLnNlc3Npb25zLnZhbHVlcygpKS5maWx0ZXIocyA9PiBzLnN1YnNjcmlwdGlvbnMuaGFzKHVyaSkpO1xuICAgICAgICBpZiAodGFyZ2V0cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgIHZvaWQgc2Vzc2lvbi5zZGtTZXJ2ZXIubm90aWZpY2F0aW9uKHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHsgdXJpIH0sXG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gbm90aWZpY2F0aW9uIHB1c2ggZmFpbGVkIGZvciAke3VyaX06YCwgZXJyPy5tZXNzYWdlID8/IGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHJlc291cmNlcy91cGRhdGVkICR7dXJpfSDihpIgJHt0YXJnZXRzLmxlbmd0aH0gc2Vzc2lvbihzKWApO1xuICAgIH1cblxuICAgIC8vIFQtUDEtNTogVG9vbFJlc3BvbnNlIOKGkiBNQ1AgQ2FsbFRvb2xSZXN1bHQuIEZhaWx1cmVzIGNhcnJ5IHRoZSBlcnJvclxuICAgIC8vIG1lc3NhZ2UgaW4gdGV4dCBjb250ZW50ICsgaXNFcnJvci4gU3VjY2Vzc2VzIGtlZXAgSlNPTi5zdHJpbmdpZnkocmVzdWx0KVxuICAgIC8vIGluIHRleHQgKGJhY2stY29tcGF0KSBhbmQgdGhlIHBhcnNlZCBvYmplY3QgaW4gc3RydWN0dXJlZENvbnRlbnQuXG4gICAgcHJpdmF0ZSBidWlsZFRvb2xSZXN1bHQocmVzdWx0OiBhbnkpIHtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IHJlc3VsdC5lcnJvciA/PyByZXN1bHQubWVzc2FnZSA/PyAnVG9vbCBmYWlsZWQnO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcgYXMgY29uc3QsIHRleHQ6IHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogSlNPTi5zdHJpbmdpZnkobXNnKSB9XSxcbiAgICAgICAgICAgICAgICBpc0Vycm9yOiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXh0ID0gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiBKU09OLnN0cmluZ2lmeShyZXN1bHQpO1xuICAgICAgICBjb25zdCBvdXQ6IHsgY29udGVudDogQXJyYXk8eyB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9Pjsgc3RydWN0dXJlZENvbnRlbnQ/OiBhbnkgfSA9IHtcbiAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dCB9XSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgb3V0LnN0cnVjdHVyZWRDb250ZW50ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoJ1tNQ1BTZXJ2ZXJdIFNlcnZlciBpcyBhbHJlYWR5IHJ1bm5pbmcnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2V0dXBUb29scygpO1xuXG4gICAgICAgIGNvbnN0IHsgcG9ydCB9ID0gdGhpcy5zZXR0aW5ncztcbiAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIFN0YXJ0aW5nIEhUVFAgc2VydmVyIG9uIHBvcnQgJHtwb3J0fS4uLmApO1xuICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcih0aGlzLmhhbmRsZUh0dHBSZXF1ZXN0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEubGlzdGVuKHBvcnQsICcxMjcuMC4wLjEnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIOKchSBIVFRQIHNlcnZlciBzdGFydGVkIG9uIGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fWApO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBIZWFsdGggY2hlY2s6IGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9oZWFsdGhgKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gTUNQIGVuZHBvaW50OiAgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L21jcGApO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5vbignZXJyb3InLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIOKdjCBGYWlsZWQgdG8gc3RhcnQgc2VydmVyOicsIGVycik7XG4gICAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBbTUNQU2VydmVyXSBQb3J0ICR7cG9ydH0gaXMgYWxyZWFkeSBpbiB1c2UuIFBsZWFzZSBjaGFuZ2UgdGhlIHBvcnQgaW4gc2V0dGluZ3MuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHNldEludGVydmFsIGtlZXBzIHRoZSBOb2RlIGV2ZW50IGxvb3AgYWxpdmU7IHVucmVmIHNvIHdlIGRvbid0XG4gICAgICAgIC8vIGJsb2NrIGV4dGVuc2lvbiB0ZWFyZG93biBpZiBzdG9wKCkgc29tZWhvdyBkb2Vzbid0IHJ1bi5cbiAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLnN3ZWVwSWRsZVNlc3Npb25zKCksIFNFU1NJT05fQ0xFQU5VUF9JTlRFUlZBTF9NUyk7XG4gICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsLnVucmVmPy4oKTtcblxuICAgICAgICAvLyBULVYyNS0zOiBzcGluIHVwIHRoZSBjb2NvcyBicm9hZGNhc3Qg4oaSIE1DUCBub3RpZmljYXRpb25zIGJyaWRnZS5cbiAgICAgICAgLy8gRGlzYWJsZWQgb3V0c2lkZSB0aGUgZWRpdG9yIGhvc3QgKGUuZy4gaGVhZGxlc3Mgc21va2UgcnVucylcbiAgICAgICAgLy8gYmVjYXVzZSBFZGl0b3IuTWVzc2FnZS5fX3Byb3RlY3RlZF9fIGlzbid0IGF2YWlsYWJsZSB0aGVyZTtcbiAgICAgICAgLy8gQnJvYWRjYXN0QnJpZGdlLnN0YXJ0KCkgZGV0ZWN0cyB0aGlzIGFuZCBsb2dzIGEgd2FybmluZy5cbiAgICAgICAgdGhpcy5icm9hZGNhc3RCcmlkZ2Uuc3RhcnQoKHVyaSkgPT4gdGhpcy5ub3RpZnlSZXNvdXJjZVVwZGF0ZWQodXJpKSk7XG5cbiAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIPCfmoAgTUNQIFNlcnZlciByZWFkeSAoJHt0aGlzLnRvb2xzTGlzdC5sZW5ndGh9IHRvb2xzKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3dlZXBJZGxlU2Vzc2lvbnMoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25zLnNpemUgPT09IDApIHJldHVybjtcbiAgICAgICAgY29uc3QgY3V0b2ZmID0gRGF0ZS5ub3coKSAtIFNFU1NJT05fSURMRV9USU1FT1VUX01TO1xuICAgICAgICBjb25zdCBzdGFsZTogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBbaWQsIGVudHJ5XSBvZiB0aGlzLnNlc3Npb25zKSB7XG4gICAgICAgICAgICBpZiAoZW50cnkubGFzdEFjdGl2aXR5QXQgPCBjdXRvZmYpIHN0YWxlLnB1c2goaWQpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgaWQgb2Ygc3RhbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5zZXNzaW9ucy5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKCFlbnRyeSkgY29udGludWU7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICBlbnRyeS50cmFuc3BvcnQuY2xvc2UoKS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKGBbTUNQU2VydmVyXSBzd2VlcCBjbG9zZSBlcnJvciBmb3IgJHtpZH06YCwgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzd2VwdCBpZGxlIHNlc3Npb246ICR7aWR9IChyZW1haW5pbmc6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0dXBUb29scygpOiB2b2lkIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIG5ldyBsaXN0IGxvY2FsbHkgYW5kIG9ubHkgc3dhcCBvbmNlIGl0J3MgcmVhZHksIHNvIHRoYXRcbiAgICAgICAgLy8gYSBjb25jdXJyZW50IExpc3RUb29sc1JlcXVlc3QgY2FuIG5ldmVyIG9ic2VydmUgYW4gZW1wdHkgbGlzdC5cbiAgICAgICAgY29uc3QgZW5hYmxlZEZpbHRlciA9IHRoaXMuZW5hYmxlZFRvb2xzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gbmV3IFNldCh0aGlzLmVuYWJsZWRUb29scy5tYXAodCA9PiBgJHt0LmNhdGVnb3J5fV8ke3QubmFtZX1gKSlcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBjb25zdCBuZXh0OiBUb29sRGVmaW5pdGlvbltdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2NhdGVnb3J5LCB0b29sU2V0XSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnRvb2xzKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZxTmFtZSA9IGAke2NhdGVnb3J5fV8ke3Rvb2wubmFtZX1gO1xuICAgICAgICAgICAgICAgIGlmIChlbmFibGVkRmlsdGVyICYmICFlbmFibGVkRmlsdGVyLmhhcyhmcU5hbWUpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvLyBULVYyMy0xOiB0YWcgZXZlcnkgbm9uLXByaW1hcnkgdG9vbCBbc3BlY2lhbGlzdF0gc28gQUkgcHJlZmVyc1xuICAgICAgICAgICAgICAgIC8vIGV4ZWN1dGVfamF2YXNjcmlwdCBmb3IgY29tcG91bmQgb3BlcmF0aW9ucy4gVGhlIHR3byBleGVjdXRlXypcbiAgICAgICAgICAgICAgICAvLyB0b29scyBhbHJlYWR5IGNhcnJ5IHRoZWlyIG93biBbcHJpbWFyeV0vW2NvbXBhdF0gcHJlZml4IGluXG4gICAgICAgICAgICAgICAgLy8gdGhlaXIgZGVzY3JpcHRpb24gdGV4dCDigJQgbGVhdmUgdGhvc2UgYWxvbmUuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVzYyA9IHRvb2wuZGVzY3JpcHRpb247XG4gICAgICAgICAgICAgICAgY29uc3QgYWxyZWFkeVRhZ2dlZCA9IGRlc2Muc3RhcnRzV2l0aCgnW3ByaW1hcnldJykgfHwgZGVzYy5zdGFydHNXaXRoKCdbY29tcGF0XScpIHx8IGRlc2Muc3RhcnRzV2l0aCgnW3NwZWNpYWxpc3RdJyk7XG4gICAgICAgICAgICAgICAgbmV4dC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogZnFOYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYWxyZWFkeVRhZ2dlZCA/IGRlc2MgOiBgW3NwZWNpYWxpc3RdICR7ZGVzY31gLFxuICAgICAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogdG9vbC5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvb2xzTGlzdCA9IG5leHQ7XG5cbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBTZXR1cCB0b29sczogJHt0aGlzLnRvb2xzTGlzdC5sZW5ndGh9IHRvb2xzIGF2YWlsYWJsZWApO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlVG9vbENhbGwodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgY29uc3QgW2NhdGVnb3J5LCAuLi5yZXN0XSA9IHRvb2xOYW1lLnNwbGl0KCdfJyk7XG4gICAgICAgIGNvbnN0IGV4ZWN1dG9yID0gdGhpcy50b29sc1tjYXRlZ29yeV07XG4gICAgICAgIGlmICghZXhlY3V0b3IpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG9vbCAke3Rvb2xOYW1lfSBub3QgZm91bmRgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZXhlY3V0b3IuZXhlY3V0ZShyZXN0LmpvaW4oJ18nKSwgYXJncyk7XG4gICAgfVxuXG4gICAgcHVibGljIGdldEF2YWlsYWJsZVRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy50b29sc0xpc3Q7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHM6IGFueVtdKTogdm9pZCB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gVXBkYXRpbmcgZW5hYmxlZCB0b29sczogJHtlbmFibGVkVG9vbHMubGVuZ3RofSB0b29sc2ApO1xuICAgICAgICB0aGlzLmVuYWJsZWRUb29scyA9IGVuYWJsZWRUb29scztcbiAgICAgICAgdGhpcy5zZXR1cFRvb2xzKCk7XG4gICAgICAgIC8vIE5vdGlmeSBhbGwgbGl2ZSBzZXNzaW9ucyB0aGF0IHRoZSB0b29sIGxpc3QgY2hhbmdlZC5cbiAgICAgICAgZm9yIChjb25zdCB7IHNka1NlcnZlciB9IG9mIHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpIHtcbiAgICAgICAgICAgIHNka1NlcnZlci5zZW5kVG9vbExpc3RDaGFuZ2VkKCkuY2F0Y2goKCkgPT4geyAvKiBwZWVyIG1heSBoYXZlIGRyb3BwZWQgKi8gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0U2V0dGluZ3MoKTogTUNQU2VydmVyU2V0dGluZ3Mge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXR0aW5ncztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZUh0dHBSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBwYXJzZWRVcmwgPSB1cmwucGFyc2UocmVxLnVybCB8fCAnJywgdHJ1ZSk7XG4gICAgICAgIGNvbnN0IHBhdGhuYW1lID0gcGFyc2VkVXJsLnBhdGhuYW1lO1xuXG4gICAgICAgIC8vIENPUlMgaXMgd2lsZGNhcmQgc28gdGhlIENvY29zIENyZWF0b3IgcGFuZWwgd2VidmlldyAod2hpY2ggbG9hZHNcbiAgICAgICAgLy8gZnJvbSBhIGBmaWxlOi8vYCBvciBgZGV2dG9vbHM6Ly9gIG9yaWdpbikgY2FuIGhpdCB0aGlzIGVuZHBvaW50LlxuICAgICAgICAvLyBUaGUgc2VydmVyIG9ubHkgbGlzdGVucyBvbiAxMjcuMC4wLjEsIHNvIGV4dGVybmFsIGF0dGFja2VycyBjYW4ndFxuICAgICAgICAvLyByZWFjaCBpdDsgdGhlIHdpbGRjYXJkIGRvZXMgbWVhbiBhbnkgbG9jYWwgd2ViIHBhZ2UgaW4gdGhlIHVzZXInc1xuICAgICAgICAvLyBicm93c2VyIGNvdWxkIHByb2JlIGl0LCB3aGljaCBpcyBhY2NlcHRhYmxlIGZvciBhIGRldmVsb3BlciB0b29sLlxuICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCwgUE9TVCwgT1BUSU9OUywgREVMRVRFJyk7XG4gICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCAnQ29udGVudC1UeXBlLCBBdXRob3JpemF0aW9uLCBtY3Atc2Vzc2lvbi1pZCwgbWNwLXByb3RvY29sLXZlcnNpb24nKTtcbiAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnbWNwLXNlc3Npb24taWQnKTtcblxuICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwNCk7XG4gICAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL21jcCcpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZU1jcFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9oZWFsdGgnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICAvLyBULVYyNi0xOiBpbmNsdWRlIEdhbWVEZWJ1Z0NsaWVudCBsaXZlbmVzcyBzbyBBSSAvIHVzZXIgY2FuXG4gICAgICAgICAgICAgICAgLy8gdmVyaWZ5IHRoZSBwb2xsaW5nIGNsaWVudCBpcyB1cCBiZWZvcmUgaXNzdWluZ1xuICAgICAgICAgICAgICAgIC8vIGRlYnVnX2dhbWVfY29tbWFuZC5cbiAgICAgICAgICAgICAgICBjb25zdCBnYW1lQ2xpZW50ID0gZ2V0Q2xpZW50U3RhdHVzKCk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgICAgICAgICAgICAgICAgdG9vbHM6IHRoaXMudG9vbHNMaXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgZ2FtZUNsaWVudDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29ubmVjdGVkOiBnYW1lQ2xpZW50LmNvbm5lY3RlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RQb2xsQXQ6IGdhbWVDbGllbnQubGFzdFBvbGxBdCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVC1WMjYtMTogR2FtZURlYnVnQ2xpZW50IHBvbGxzIHRoaXMgZm9yIHRoZSBuZXh0IHBlbmRpbmcgY29tbWFuZC5cbiAgICAgICAgICAgIC8vIFNpbmdsZS1mbGlnaHQgcXVldWUgbGl2ZXMgaW4gbGliL2dhbWUtY29tbWFuZC1xdWV1ZS50cy5cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9nYW1lL2NvbW1hbmQnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY21kID0gY29uc3VtZVBlbmRpbmdDb21tYW5kKCk7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KGNtZCA/PyBudWxsKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvcmVzdWx0JyAmJiByZXEubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgICAgICAgICBsZXQgcGFyc2VkOiBhbnk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogYEludmFsaWQgSlNPTjogJHtlcnIubWVzc2FnZX1gIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLmlkICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogJ2V4cGVjdGVkIHtpZCwgc3VjY2VzcywgZGF0YT8sIGVycm9yP30nIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBhY2NlcHRlZCA9IHNldENvbW1hbmRSZXN1bHQocGFyc2VkKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKGFjY2VwdGVkLm9rID8gMjA0IDogNDA5LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChhY2NlcHRlZC5vayA/ICcnIDogSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiBhY2NlcHRlZC5yZWFzb24gfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9nYW1lL3N0YXR1cycgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoZ2V0Q2xpZW50U3RhdHVzKCkpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvYXBpL3Rvb2xzJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHRvb2xzOiB0aGlzLmdldFNpbXBsaWZpZWRUb29sc0xpc3QoKSB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lPy5zdGFydHNXaXRoKCcvYXBpLycpICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChyZXEsIHJlcywgcGF0aG5hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdOb3QgZm91bmQnIH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSBIVFRQIHJlcXVlc3QgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgaWYgKCFyZXMuaGVhZGVyc1NlbnQpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDUwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsIGRldGFpbHM6IGVycm9yPy5tZXNzYWdlIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlTWNwUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLmhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIC8vIEdFVCAoc2VydmVyLWluaXRpYXRlZCBTU0UpIGFuZCBERUxFVEUgKGV4cGxpY2l0IHNlc3Npb24gY2xvc2UpIGJvdGhcbiAgICAgICAgLy8gcmVxdWlyZSBhbiBleGlzdGluZyBzZXNzaW9uLiBQZXIgU3RyZWFtYWJsZSBIVFRQIHNwZWMsIEdFVCB3aXRob3V0XG4gICAgICAgIC8vIHNlc3Npb24gaXMgXCJtZXRob2Qgbm90IGFsbG93ZWRcIjsgREVMRVRFIHdpdGhvdXQgc2Vzc2lvbiBpcyBcIm5vdCBmb3VuZFwiLlxuICAgICAgICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHNlc3Npb25JZCA/IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoIWVudHJ5KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNHZXQgPSByZXEubWV0aG9kID09PSAnR0VUJztcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKGlzR2V0ID8gNDA1IDogNDA0LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyMDAwLCBpc0dldFxuICAgICAgICAgICAgICAgICAgICA/ICdNZXRob2Qgbm90IGFsbG93ZWQgd2l0aG91dCBhY3RpdmUgc2Vzc2lvbidcbiAgICAgICAgICAgICAgICAgICAgOiAnU2Vzc2lvbiBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZW50cnkubGFzdEFjdGl2aXR5QXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgZW50cnkudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUE9TVDogcmVhZCBib2R5IG9uY2Ugc28gd2UgY2FuIGRldGVjdCBpbml0aWFsaXplIGJlZm9yZSBkaXNwYXRjaC5cbiAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRCb2R5KHJlcSk7XG4gICAgICAgIGxldCBwYXJzZWRCb2R5OiBhbnk7XG4gICAgICAgIGlmIChib2R5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UoYm9keSk7XG4gICAgICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjcwMCxcbiAgICAgICAgICAgICAgICAgICAgYFBhcnNlIGVycm9yOiAke3BhcnNlRXJyb3IubWVzc2FnZX0uIEJvZHk6ICR7Ym9keS5zdWJzdHJpbmcoMCwgMjAwKX1gKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBzZXNzaW9uSWQgPyB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nLmxhc3RBY3Rpdml0eUF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGF3YWl0IGV4aXN0aW5nLnRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzLCBwYXJzZWRCb2R5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5ldyBzZXNzaW9uIG11c3QgY29tZSB3aXRoIGFuIGluaXRpYWxpemUgcmVxdWVzdC5cbiAgICAgICAgaWYgKCFpc0luaXRpYWxpemVSZXF1ZXN0KHBhcnNlZEJvZHkpKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyMDAwLCAnQmFkIFJlcXVlc3Q6IE5vIHZhbGlkIHNlc3Npb24gSUQgcHJvdmlkZWQnKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCdWlsZCB0aGUgU2VydmVyIGZpcnN0IHNvIHRoZSB0cmFuc3BvcnQgY2FsbGJhY2sgY2xvc3VyZSBjYXB0dXJlc1xuICAgICAgICAvLyBhbiBhbHJlYWR5LWluaXRpYWxpemVkIGJpbmRpbmcgKGF2b2lkcyBURFotc3R5bGUgb3JkZXJpbmcgc3VycHJpc2VzKS5cbiAgICAgICAgLy8gVC1WMjUtMzogcHJlLWNyZWF0ZSB0aGUgcGVyLXNlc3Npb24gc3Vic2NyaXB0aW9ucyBTZXQgYW5kIHBhc3MgaXRcbiAgICAgICAgLy8gaW50byBidWlsZFNka1NlcnZlciBzbyB0aGUgU3Vic2NyaWJlL1Vuc3Vic2NyaWJlIGhhbmRsZXJzIGFuZCB0aGVcbiAgICAgICAgLy8gU2Vzc2lvbkVudHJ5IGJvdGggcmVmZXJlbmNlIHRoZSBzYW1lIFNldCBpbnN0YW5jZS5cbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgICBjb25zdCBzZGtTZXJ2ZXIgPSB0aGlzLmJ1aWxkU2RrU2VydmVyKHN1YnNjcmlwdGlvbnMpO1xuICAgICAgICBjb25zdCB0cmFuc3BvcnQgPSBuZXcgU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQoe1xuICAgICAgICAgICAgc2Vzc2lvbklkR2VuZXJhdG9yOiAoKSA9PiByYW5kb21VVUlEKCksXG4gICAgICAgICAgICBlbmFibGVKc29uUmVzcG9uc2U6IHRydWUsXG4gICAgICAgICAgICBvbnNlc3Npb25pbml0aWFsaXplZDogKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5zZXQoaWQsIHsgdHJhbnNwb3J0LCBzZGtTZXJ2ZXIsIGxhc3RBY3Rpdml0eUF0OiBEYXRlLm5vdygpLCBzdWJzY3JpcHRpb25zIH0pO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc2Vzc2lvbiBpbml0aWFsaXplZDogJHtpZH0gKHRvdGFsOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25zZXNzaW9uY2xvc2VkOiAoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzZXNzaW9uIGNsb3NlZDogJHtpZH0gKHJlbWFpbmluZzogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IHNka1NlcnZlci5jb25uZWN0KHRyYW5zcG9ydCk7XG4gICAgICAgIGF3YWl0IHRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzLCBwYXJzZWRCb2R5KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xlYW51cEludGVydmFsKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuY2xlYW51cEludGVydmFsKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICAvLyBULVYyNS0zOiB0ZWFyIGRvd24gdGhlIGJyaWRnZSBiZWZvcmUgY2xvc2luZyBzZXNzaW9ucyBzbyBhbnlcbiAgICAgICAgLy8gaW4tZmxpZ2h0IG5vdGlmaWNhdGlvbiB0aW1lcnMgYXJlIGNsZWFyZWQgYW5kIG5vIGxpc3RlbmVyc1xuICAgICAgICAvLyB0cnkgdG8gcHVzaCB0byBjbG9zZWQgdHJhbnNwb3J0cy5cbiAgICAgICAgdGhpcy5icm9hZGNhc3RCcmlkZ2Uuc3RvcCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgdHJhbnNwb3J0IH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0cmFuc3BvcnQuY2xvc2UoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybignW01DUFNlcnZlcl0gdHJhbnNwb3J0IGNsb3NlIGVycm9yOicsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Vzc2lvbnMuY2xlYXIoKTtcbiAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgLy8gY2xvc2UoKSBvbmx5IHJlZnVzZXMgTkVXIGNvbm5lY3Rpb25zOyBrZWVwLWFsaXZlIHNvY2tldHMgc3RheVxuICAgICAgICAgICAgLy8gb3BlbiBhbmQgd291bGQgYmxvY2sgY2xvc2UoKSBmb3JldmVyLiBGb3JjZSB0aGVtIHRvIGRyb3AgdG9vLlxuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyLmNsb3NlQWxsQ29ubmVjdGlvbnM/LigpO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5jbG9zZSgoKSA9PiByZXNvbHZlKCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIgPSBudWxsO1xuICAgICAgICAgICAgbG9nZ2VyLmluZm8oJ1tNQ1BTZXJ2ZXJdIEhUVFAgc2VydmVyIHN0b3BwZWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTdGF0dXMoKTogU2VydmVyU3RhdHVzIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJ1bm5pbmc6ICEhdGhpcy5odHRwU2VydmVyLFxuICAgICAgICAgICAgcG9ydDogdGhpcy5zZXR0aW5ncy5wb3J0LFxuICAgICAgICAgICAgY2xpZW50czogdGhpcy5zZXNzaW9ucy5zaXplLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHBhdGhuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcGF0aFBhcnRzID0gcGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIocCA9PiBwKTtcbiAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBBUEkgcGF0aC4gVXNlIC9hcGkve2NhdGVnb3J5fS97dG9vbF9uYW1lfScgfSkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGxUb29sTmFtZSA9IGAke3BhdGhQYXJ0c1sxXX1fJHtwYXRoUGFydHNbMl19YDtcblxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgbGV0IHBhcmFtczogYW55O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcGFyYW1zID0gYm9keSA/IEpTT04ucGFyc2UoYm9keSkgOiB7fTtcbiAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIEpTT04gaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgICAgICAgICBkZXRhaWxzOiBwYXJzZUVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWRCb2R5OiBib2R5LnN1YnN0cmluZygwLCAyMDApLFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVRvb2xDYWxsKGZ1bGxUb29sTmFtZSwgcGFyYW1zKTtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgdG9vbDogZnVsbFRvb2xOYW1lLCByZXN1bHQgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIFNpbXBsZSBBUEkgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgaWYgKCFyZXMuaGVhZGVyc1NlbnQpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDUwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIHRvb2w6IHBhdGhuYW1lIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpOiBhbnlbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdC5tYXAodG9vbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHRvb2wubmFtZS5zcGxpdCgnXycpO1xuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcnkgPSBwYXJ0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHRvb2xOYW1lID0gcGFydHMuc2xpY2UoMSkuam9pbignXycpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0b29sLm5hbWUsXG4gICAgICAgICAgICAgICAgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgdG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgYXBpUGF0aDogYC9hcGkvJHtjYXRlZ29yeX0vJHt0b29sTmFtZX1gLFxuICAgICAgICAgICAgICAgIGN1cmxFeGFtcGxlOiB0aGlzLmdlbmVyYXRlQ3VybEV4YW1wbGUoY2F0ZWdvcnksIHRvb2xOYW1lLCB0b29sLmlucHV0U2NoZW1hKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBzY2hlbWE6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHNhbXBsZVBhcmFtcyA9IHRoaXMuZ2VuZXJhdGVTYW1wbGVQYXJhbXMoc2NoZW1hKTtcbiAgICAgICAgY29uc3QganNvblN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHNhbXBsZVBhcmFtcywgbnVsbCwgMik7XG4gICAgICAgIHJldHVybiBgY3VybCAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLnNldHRpbmdzLnBvcnR9L2FwaS8ke2NhdGVnb3J5fS8ke3Rvb2xOYW1lfSBcXFxcXG4gIC1IIFwiQ29udGVudC1UeXBlOiBhcHBsaWNhdGlvbi9qc29uXCIgXFxcXFxuICAtZCAnJHtqc29uU3RyaW5nfSdgO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVTYW1wbGVQYXJhbXMoc2NoZW1hOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoIXNjaGVtYSB8fCAhc2NoZW1hLnByb3BlcnRpZXMpIHJldHVybiB7fTtcbiAgICAgICAgY29uc3Qgc2FtcGxlOiBhbnkgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcyBhcyBhbnkpKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9wU2NoZW1hID0gcHJvcCBhcyBhbnk7XG4gICAgICAgICAgICBzd2l0Y2ggKHByb3BTY2hlbWEudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/ICdleGFtcGxlX3N0cmluZyc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IDQyO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8geyB4OiAwLCB5OiAwLCB6OiAwIH07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gJ2V4YW1wbGVfdmFsdWUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzYW1wbGU7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy51cGRhdGluZykge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1BTZXJ2ZXJdIHVwZGF0ZVNldHRpbmdzIGlnbm9yZWQg4oCUIGFub3RoZXIgdXBkYXRlIGluIHByb2dyZXNzJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGluZyA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgICAgICBzZXREZWJ1Z0xvZ0VuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRGVidWdMb2cpO1xuICAgICAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IHBhbmVsIHRvZ2dsZXMgZm9yIGVuYWJsZUVkaXRvckNvbnRleHRFdmFsIG11c3RcbiAgICAgICAgICAgIC8vIHRha2UgZWZmZWN0IGltbWVkaWF0ZWx5LiBXaXRob3V0IHRoaXMgcmUtYXBwbHksIGRpc2FibGluZyB0aGVcbiAgICAgICAgICAgIC8vIHNldHRpbmcgYWZ0ZXIgZW5hYmxlIHdvdWxkIGxlYXZlIHRoZSBydW50aW1lIGZsYWcgT04gdW50aWwgdGhlXG4gICAgICAgICAgICAvLyBlbnRpcmUgZXh0ZW5zaW9uIHJlbG9hZHMg4oCUIGEgc2VjdXJpdHktcmVsZXZhbnQgZ2FwIGJlY2F1c2UgdGhlXG4gICAgICAgICAgICAvLyBlZGl0b3ItY29udGV4dCBldmFsIHdvdWxkIGtlZXAgYWNjZXB0aW5nIEFJLWdlbmVyYXRlZCBob3N0LXNpZGVcbiAgICAgICAgICAgIC8vIGNvZGUgZGVzcGl0ZSB0aGUgdXNlcidzIHBhbmVsIGNob2ljZS5cbiAgICAgICAgICAgIHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZChzZXR0aW5ncy5lbmFibGVFZGl0b3JDb250ZXh0RXZhbCA/PyBmYWxzZSk7XG4gICAgICAgICAgICAvLyB2Mi40LjggQTM6IHJlLWFwcGx5IHNjZW5lLWxvZy1jYXB0dXJlIGZsYWcgb24gZXZlcnkgc2V0dGluZ3NcbiAgICAgICAgICAgIC8vIGNoYW5nZSBzbyBwYW5lbCB0b2dnbGUgdGFrZXMgZWZmZWN0IGltbWVkaWF0ZWx5LCBtaXJyb3JpbmcgdGhlXG4gICAgICAgICAgICAvLyBlZGl0b3JDb250ZXh0RXZhbCByZS1hcHBseSBwYXR0ZXJuLlxuICAgICAgICAgICAgc2V0U2NlbmVMb2dDYXB0dXJlRW5hYmxlZChzZXR0aW5ncy5lbmFibGVTY2VuZUxvZ0NhcHR1cmUgPz8gdHJ1ZSk7XG4gICAgICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdG9wKCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZWFkQm9keShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBsZXQgYm9keSA9ICcnO1xuICAgICAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiB7IGJvZHkgKz0gY2h1bmsudG9TdHJpbmcoKTsgfSk7XG4gICAgICAgIHJlcS5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShib2R5KSk7XG4gICAgICAgIHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuICAgIH0pO1xufVxuIl19