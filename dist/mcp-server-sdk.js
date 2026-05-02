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
const SERVER_VERSION = '2.7.3';
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
        //
        // EXCEPTION: /game/* endpoints are scoped to a strict origin
        // allowlist (v2.7.0 #2 fix on v2.6.0 review W7). The reasoning:
        // /game/result is a write endpoint that mutates the single-flight
        // queue state shared by ALL MCP sessions on this host. A malicious
        // local browser tab with the wildcard CORS could time a POST to
        // race a legitimate command's result. /game/command and
        // /game/status are reads but the legitimate caller (GameDebugClient
        // running inside cocos preview / browser preview) is well-known.
        const isGameEndpoint = (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith('/game/')) === true;
        // v2.8.0 T-V28-1 (carryover from v2.7.0 Claude single-reviewer 🟡):
        // hoist resolveGameCorsOrigin so the OPTIONS branch, the response-
        // header branch, and the post-CORS 403 enforcement (later in
        // requestHandler) share one classification call.
        const gameAcao = isGameEndpoint
            ? resolveGameCorsOrigin(req.headers.origin)
            : null;
        if (isGameEndpoint) {
            // v2.8.0 T-V28-1 (carryover from v2.7.0 Claude single-reviewer 🟡):
            // emit Vary: Origin on BOTH allow- and deny- branches so a shared
            // browser cache cannot serve a cached allowed-origin response to a
            // later disallowed origin (or vice versa). The header is set once
            // here regardless of acao outcome.
            res.setHeader('Vary', 'Origin');
            if (gameAcao !== null) {
                res.setHeader('Access-Control-Allow-Origin', gameAcao);
            } // else: omit ACAO entirely; browsers will block the response.
            // Reject preflight from disallowed origins fast so the request
            // never reaches the queue logic.
            if (req.method === 'OPTIONS') {
                if (gameAcao === null) {
                    res.writeHead(403);
                    res.end();
                    return;
                }
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.writeHead(204);
                res.end();
                return;
            }
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
            res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
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
            // v2.7.0 #2: enforce origin allowlist for /game/* writes too.
            // Browser preflight is already blocked (above) but a non-browser
            // client (or a browser with simple-request bypass) can still
            // POST/GET. Reject 403 here to harden the queue against
            // cross-tab hijack.
            // v2.8.0 T-V28-1: reuse the already-classified gameAcao instead of
            // re-running resolveGameCorsOrigin (cheap call but it kept origin
            // classification logic in two places).
            if (isGameEndpoint && gameAcao === null) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'origin not allowed for /game/* endpoints' }));
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
                // v2.6.1 review fix (claude W2): require both id (string) and
                // success (boolean). Without the success check, a buggy client
                // posting {id, error} would slip through and downstream code
                // would treat success !== false as truthy.
                if (!parsed || typeof parsed.id !== 'string' || typeof parsed.success !== 'boolean') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'expected {id: string, success: boolean, data?, error?}' }));
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
                // v2.6.1: 413 surface for body-cap rejections so clients
                // can distinguish "you sent too much" from server faults.
                if (error instanceof BodyTooLargeError) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                }
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
// v2.7.0 #2 (W7 from v2.6.0 review): resolve the Access-Control-Allow-Origin
// header value for /game/* endpoints. Returns:
//   - the echo'd origin string when the origin is in our trust list
//   - the literal 'null' string when the request has Origin: null (file://
//     URLs send this; cocos PIE webview often runs from file://)
//   - the wildcard '*' for no-Origin requests (curl/Node clients, same-
//     origin requests that don't send Origin) — CORS only matters in
//     browsers, and same-origin / no-Origin paths can't be cross-tab
//     attackers
//   - null (the JS value) when the origin is disallowed → caller omits the
//     ACAO header so browsers block the response
function resolveGameCorsOrigin(origin) {
    if (origin === undefined || origin === '') {
        // No Origin header → not a browser fetch. Allow.
        return '*';
    }
    if (origin === 'null') {
        // file:// pages and some sandboxed iframes send 'null'. Allow:
        // cocos PIE webview often falls into this bucket.
        return 'null';
    }
    // Allow loopback HTTP origins (cocos browser preview at
    // http://localhost:7456 etc.) and devtools/file schemes.
    try {
        const u = new URL(origin);
        if (u.protocol === 'file:' || u.protocol === 'devtools:')
            return origin;
        // v2.7.1 review fix (claude 🟡 + gemini 🔴): WHATWG URL keeps
        // brackets around IPv6 hostnames on Node 18+, but older bundled
        // Node builds may strip them — accept both to be portable across
        // whatever Node the cocos editor ships at any given version.
        if ((u.protocol === 'http:' || u.protocol === 'https:')
            && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'
                || u.hostname === '[::1]' || u.hostname === '::1')) {
            return origin;
        }
    }
    catch (_a) {
        // Malformed Origin header → reject.
    }
    return null;
}
// v2.6.1 review fix (codex 🔴 + claude W1): cap request bodies at 32 MB.
// Screenshots come back as data URLs that can legitimately be a few MB on
// 4k canvases, so we set the cap generously rather than per-endpoint.
// Above the cap we destroy the connection so the client sees a hard close
// rather than a slow truthful 413 (avoids them continuing to stream).
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024;
class BodyTooLargeError extends Error {
    constructor() {
        super(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
        this.statusCode = 413;
    }
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > MAX_REQUEST_BODY_BYTES) {
                req.destroy();
                reject(new BodyTooLargeError());
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFXNEM7QUFFNUMsbUNBQXVEO0FBQ3ZELHVEQUE2RjtBQUU3RixtREFBZ0Y7QUFDaEYsNkRBQXlEO0FBQ3pELGlEQUEwRTtBQUMxRSxpRUFJa0M7QUFFbEMsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDdkMsK0VBQStFO0FBQy9FLDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0UsMkRBQTJEO0FBQzNELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBWTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQWdCbEIsWUFBWSxRQUEyQixFQUFFLFFBQXNCOztRQWR2RCxlQUFVLEdBQXVCLElBQUksQ0FBQztRQUN0QyxhQUFRLEdBQThCLElBQUksR0FBRyxFQUFFLENBQUM7UUFJaEQsY0FBUyxHQUFxQixFQUFFLENBQUM7UUFDakMsaUJBQVksR0FBVSxFQUFFLENB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QVEsQ0FBQyxDQUFDO1FBRHJFLGVBQVUsR0FBRyxHQUFHLENBQUM7SUFDcUQsQ0FBQztDQUNuRjtBQUVELFNBQVMsUUFBUSxDQUFDLEdBQXlCO0lBQ3ZDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDbkMsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBQzVCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBYSxFQUFFLEVBQUU7WUFDN0IsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDdEIsSUFBSSxLQUFLLEdBQUcsc0JBQXNCLEVBQUUsQ0FBQztnQkFDakMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLE1BQU0sQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztnQkFDaEMsT0FBTztZQUNYLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRSxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IFNlcnZlciB9IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL2luZGV4LmpzJztcbmltcG9ydCB7IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvc3RyZWFtYWJsZUh0dHAuanMnO1xuaW1wb3J0IHtcbiAgICBDYWxsVG9vbFJlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hLFxuICAgIFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsXG4gICAgU3Vic2NyaWJlUmVxdWVzdFNjaGVtYSxcbiAgICBVbnN1YnNjcmliZVJlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFByb21wdHNSZXF1ZXN0U2NoZW1hLFxuICAgIEdldFByb21wdFJlcXVlc3RTY2hlbWEsXG4gICAgaXNJbml0aWFsaXplUmVxdWVzdCxcbn0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1BTZXJ2ZXJTZXR0aW5ncywgU2VydmVyU3RhdHVzLCBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgc2V0RGVidWdMb2dFbmFibGVkLCBsb2dnZXIgfSBmcm9tICcuL2xpYi9sb2cnO1xuaW1wb3J0IHsgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkLCBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkIH0gZnJvbSAnLi9saWIvcnVudGltZS1mbGFncyc7XG5pbXBvcnQgeyBUb29sUmVnaXN0cnkgfSBmcm9tICcuL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IFJlc291cmNlUmVnaXN0cnksIGNyZWF0ZVJlc291cmNlUmVnaXN0cnkgfSBmcm9tICcuL3Jlc291cmNlcy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBCcm9hZGNhc3RCcmlkZ2UgfSBmcm9tICcuL2xpYi9icm9hZGNhc3QtYnJpZGdlJztcbmltcG9ydCB7IFByb21wdFJlZ2lzdHJ5LCBjcmVhdGVQcm9tcHRSZWdpc3RyeSB9IGZyb20gJy4vcHJvbXB0cy9yZWdpc3RyeSc7XG5pbXBvcnQge1xuICAgIGNvbnN1bWVQZW5kaW5nQ29tbWFuZCxcbiAgICBzZXRDb21tYW5kUmVzdWx0LFxuICAgIGdldENsaWVudFN0YXR1cyxcbn0gZnJvbSAnLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcblxuY29uc3QgU0VSVkVSX05BTUUgPSAnY29jb3MtbWNwLXNlcnZlcic7XG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChnZW1pbmkg8J+UtCk6IGtlZXAgdGhpcyBpbiBzeW5jIHdpdGggcGFja2FnZS5qc29uJ3Ncbi8vIHZlcnNpb24gb24gZXZlcnkgbWlub3IvbWFqb3IgYnVtcC4gU0RLIFNlcnZlciBpbml0aWFsaXplIHJlc3BvbnNlIGNhcnJpZXNcbi8vIHRoaXMgc3RyaW5nOyBjbGllbnRzIHNlZSBpdCBkdXJpbmcgTUNQIGhhbmRzaGFrZS4gRHJpZnQgc2luY2UgdjIuMC4wIGhhc1xuLy8gYmVlbiBjb25mdXNpbmcgcmV2aWV3IHJvdW5kcyBhbmQgbGl2ZS10ZXN0IHZlcmlmaWNhdGlvbi5cbmNvbnN0IFNFUlZFUl9WRVJTSU9OID0gJzIuNy4zJztcblxuLy8gSWRsZSBzZXNzaW9uIHN3ZWVwOiBkcm9wIHNlc3Npb25zIHRoYXQgaGF2ZW4ndCBiZWVuIHRvdWNoZWQgaW4gdGhpcyBtYW55IG1zLlxuLy8gU2V0IGNvbnNlcnZhdGl2ZWx5IGxvbmcgZm9yIGVkaXRvciB1c2FnZSB3aGVyZSBhIGRldmVsb3BlciBtYXkgcGF1c2Ugd29yay5cbmNvbnN0IFNFU1NJT05fSURMRV9USU1FT1VUX01TID0gMzAgKiA2MCAqIDEwMDA7XG5jb25zdCBTRVNTSU9OX0NMRUFOVVBfSU5URVJWQUxfTVMgPSA2MCAqIDEwMDA7XG5cbmludGVyZmFjZSBTZXNzaW9uRW50cnkge1xuICAgIHRyYW5zcG9ydDogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQ7XG4gICAgc2RrU2VydmVyOiBTZXJ2ZXI7XG4gICAgbGFzdEFjdGl2aXR5QXQ6IG51bWJlcjtcbiAgICAvLyBULVYyNS0zOiBwZXItc2Vzc2lvbiByZXNvdXJjZSBVUkkgc3Vic2NyaXB0aW9ucyBmb3JcbiAgICAvLyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHB1c2guIEVtcHR5IHNldCDihpIgc2Vzc2lvblxuICAgIC8vIGdldHMgbm8gbm90aWZpY2F0aW9ucyBldmVuIGlmIHRoZSBicmlkZ2UgZmlyZXMuXG4gICAgc3Vic2NyaXB0aW9uczogU2V0PHN0cmluZz47XG59XG5cbmZ1bmN0aW9uIGpzb25ScGNFcnJvcihjb2RlOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogJzIuMCcsIGVycm9yOiB7IGNvZGUsIG1lc3NhZ2UgfSwgaWQ6IG51bGwgfSk7XG59XG5cbi8qKlxuICogTUNQIHNlcnZlciBiYWNrZWQgYnkgdGhlIG9mZmljaWFsIEBtb2RlbGNvbnRleHRwcm90b2NvbC9zZGsgU2VydmVyICtcbiAqIFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IChzdGF0ZWZ1bCBtb2RlKS5cbiAqXG4gKiBFYWNoIE1DUCBjbGllbnQgZ2V0cyBpdHMgb3duIFNlcnZlciArIFRyYW5zcG9ydCBwYWlyIGtleWVkIGJ5XG4gKiBgbWNwLXNlc3Npb24taWRgLiBJbml0aWFsaXplIHJlcXVlc3RzIHdpdGggbm8gc2Vzc2lvbiBpZCBtaW50IGEgbmV3IHBhaXIuXG4gKiBSRVNUIGVuZHBvaW50cyAoL2hlYWx0aCwgL2FwaS90b29scywgL2FwaS97Y2F0fS97dG9vbH0pIHNoYXJlIHRoZSBzYW1lXG4gKiB1bmRlcmx5aW5nIGh0dHAuU2VydmVyLlxuICovXG5leHBvcnQgY2xhc3MgTUNQU2VydmVyIHtcbiAgICBwcml2YXRlIHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncztcbiAgICBwcml2YXRlIGh0dHBTZXJ2ZXI6IGh0dHAuU2VydmVyIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBzZXNzaW9uczogTWFwPHN0cmluZywgU2Vzc2lvbkVudHJ5PiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIHRvb2xzOiBUb29sUmVnaXN0cnk7XG4gICAgcHJpdmF0ZSByZXNvdXJjZXM6IFJlc291cmNlUmVnaXN0cnk7XG4gICAgcHJpdmF0ZSBwcm9tcHRzOiBQcm9tcHRSZWdpc3RyeTtcbiAgICBwcml2YXRlIHRvb2xzTGlzdDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgIHByaXZhdGUgZW5hYmxlZFRvb2xzOiBhbnlbXSA9IFtdO1xuICAgIHByaXZhdGUgY2xlYW51cEludGVydmFsOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgdXBkYXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAvLyBULVYyNS0zOiBicmlkZ2UgY29jb3MgZWRpdG9yIElQQyBicm9hZGNhc3RzIOKGkiBNQ1BcbiAgICAvLyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkLiBzdGFydCgpL3N0b3AoKSBsaWZlY3ljbGVcbiAgICAvLyB0aWVkIHRvIHRoZSBIVFRQIHNlcnZlci5cbiAgICBwcml2YXRlIGJyb2FkY2FzdEJyaWRnZTogQnJvYWRjYXN0QnJpZGdlID0gbmV3IEJyb2FkY2FzdEJyaWRnZSgpO1xuXG4gICAgY29uc3RydWN0b3Ioc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzLCByZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KSB7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy50b29scyA9IHJlZ2lzdHJ5O1xuICAgICAgICB0aGlzLnJlc291cmNlcyA9IGNyZWF0ZVJlc291cmNlUmVnaXN0cnkocmVnaXN0cnkpO1xuICAgICAgICAvLyBULVYyNS00OiBwcm9tcHRzIHJlZ2lzdHJ5IGJha2VkIHdpdGggcHJvamVjdCBjb250ZXh0IHRoYXQnc1xuICAgICAgICAvLyByZXNvbHZlZCBsYXppbHkg4oCUIEVkaXRvci5Qcm9qZWN0IG1heSBub3QgYmUgcmVhZHkgYXQgTUNQU2VydmVyXG4gICAgICAgIC8vIGNvbnN0cnVjdGlvbiB0aW1lIGJ1dCBpcyByZWxpYWJseSBhdmFpbGFibGUgd2hlbiBwcm9tcHRzL2dldFxuICAgICAgICAvLyBpcyBjYWxsZWQuXG4gICAgICAgIHRoaXMucHJvbXB0cyA9IGNyZWF0ZVByb21wdFJlZ2lzdHJ5KCgpID0+ICh7XG4gICAgICAgICAgICBwcm9qZWN0TmFtZTogdGhpcy5yZXNvbHZlUHJvamVjdE5hbWUoKSxcbiAgICAgICAgICAgIHByb2plY3RQYXRoOiB0aGlzLnJlc29sdmVQcm9qZWN0UGF0aCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgIHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZChzZXR0aW5ncy5lbmFibGVFZGl0b3JDb250ZXh0RXZhbCA/PyBmYWxzZSk7XG4gICAgICAgIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlU2NlbmVMb2dDYXB0dXJlID8/IHRydWUpO1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFVzaW5nIHNoYXJlZCB0b29sIHJlZ2lzdHJ5ICgke09iamVjdC5rZXlzKHJlZ2lzdHJ5KS5sZW5ndGh9IGNhdGVnb3JpZXMpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFNka1NlcnZlcihzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPik6IFNlcnZlciB7XG4gICAgICAgIGNvbnN0IHNka1NlcnZlciA9IG5ldyBTZXJ2ZXIoXG4gICAgICAgICAgICB7IG5hbWU6IFNFUlZFUl9OQU1FLCB2ZXJzaW9uOiBTRVJWRVJfVkVSU0lPTiB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgICAgICAgICAgICB0b29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBULVYyNS0zIChULVAzLTMpOiBzdWJzY3JpYmUgaXMgbm93IHRydWUg4oCUIGNsaWVudHMgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc291cmNlcy9zdWJzY3JpYmUgdG8gYSBVUkk7IHRoZSBicm9hZGNhc3QtYnJpZGdlXG4gICAgICAgICAgICAgICAgICAgIC8vIHB1c2hlcyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIG1hcHBlZCBjb2NvcyBicm9hZGNhc3QgZmlyZXMgKGRlYm91bmNlZCBwZXIgVVJJKS5cbiAgICAgICAgICAgICAgICAgICAgLy8gUkZDIDY1NzAgdGVtcGxhdGVzIGFyZSBpbXBsaWNpdGx5IHN1cHBvcnRlZCBieSByZWdpc3RlcmluZ1xuICAgICAgICAgICAgICAgICAgICAvLyBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hIGJlbG93IOKAlCBNQ1Agc3BlYyBoYXMgbm9cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb3VyY2VzLnRlbXBsYXRlcyBjYXBhYmlsaXR5IGZsYWcgKGNvY29zLWNsaSdzXG4gICAgICAgICAgICAgICAgICAgIC8vIGB0ZW1wbGF0ZXM6IHRydWVgIGlzIG5vbi1zcGVjIGFuZCB3b3VsZCBiZSBzdHJpcHBlZCkuXG4gICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSwgc3Vic2NyaWJlOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFQtVjI1LTQgKFQtUDMtMik6IDQgYmFrZWQgcHJvbXB0IHRlbXBsYXRlczsgbm9cbiAgICAgICAgICAgICAgICAgICAgLy8gaG90LXJlbG9hZCB5ZXQgc28gbGlzdENoYW5nZWQgc3RheXMgZmFsc2UuXG4gICAgICAgICAgICAgICAgICAgIHByb21wdHM6IHsgbGlzdENoYW5nZWQ6IGZhbHNlIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICB0b29sczogdGhpcy50b29sc0xpc3QubWFwKHQgPT4gKHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHQuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHQuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICB9KSksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgbmFtZSwgYXJndW1lbnRzOiBhcmdzIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwobmFtZSwgYXJncyA/PyB7fSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRUb29sUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH1dLFxuICAgICAgICAgICAgICAgICAgICBpc0Vycm9yOiB0cnVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICByZXNvdXJjZXM6IHRoaXMucmVzb3VyY2VzLmxpc3QoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHJlc291cmNlVGVtcGxhdGVzOiB0aGlzLnJlc291cmNlcy5saXN0VGVtcGxhdGVzKCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvdXJjZXMucmVhZCh1cmkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgY29udGVudHM6IFtjb250ZW50XSB9O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVC1WMjUtMzogcGVyLXNlc3Npb24gcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIGhhbmRsZXJzLiBUaGVcbiAgICAgICAgLy8gYHN1YnNjcmlwdGlvbnNgIFNldCBpcyBjYXB0dXJlZCBhdCBzZXNzaW9uLWNyZWF0aW9uIHRpbWUgYW5kXG4gICAgICAgIC8vIHNoYXJlZCB3aXRoIHRoZSBTZXNzaW9uRW50cnkgc28gYG5vdGlmeVJlc291cmNlVXBkYXRlZGBcbiAgICAgICAgLy8gY2FuIGl0ZXJhdGUgc2Vzc2lvbnMgYW5kIGNoZWNrIG1lbWJlcnNoaXAgd2l0aG91dCBhIHNlY29uZFxuICAgICAgICAvLyBsb29rdXAuXG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihTdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5hZGQodXJpKTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFVuc3Vic2NyaWJlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMuZGVsZXRlKHVyaSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHVuc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVC1WMjUtNDogcHJvbXB0cy9saXN0ICsgcHJvbXB0cy9nZXQuIFN0YXRlbGVzcyAobm8gc2Vzc2lvblxuICAgICAgICAvLyBhZmZpbml0eSBuZWVkZWQpOyByZW5kZXJlZCB0ZXh0IGJha2VzIGluIHByb2plY3QgY29udGV4dCBhdFxuICAgICAgICAvLyBjYWxsIHRpbWUgc28gYSBwcm9qZWN0IHJlbmFtZSBpcyByZWZsZWN0ZWQgaW1tZWRpYXRlbHkuXG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UHJvbXB0c1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICBwcm9tcHRzOiB0aGlzLnByb21wdHMubGlzdCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihHZXRQcm9tcHRSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBuYW1lIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLnByb21wdHMuZ2V0KG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFjb250ZW50KSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hKTogdW5rbm93blxuICAgICAgICAgICAgICAgIC8vIHByb21wdCBuYW1lcyBtdXN0IHN1cmZhY2UgYXMgSlNPTi1SUEMgZXJyb3JzIHBlciBNQ1Agc3BlYyxcbiAgICAgICAgICAgICAgICAvLyBub3QgYXMgc3VjY2Vzc2Z1bCBcIlByb21wdCBub3QgZm91bmRcIiBjb250ZW50IGJvZGllcy5cbiAgICAgICAgICAgICAgICAvLyBTREsncyBSZXF1ZXN0SGFuZGxlciBjb252ZXJ0cyB0aHJvd24gRXJyb3JzIGludG9cbiAgICAgICAgICAgICAgICAvLyAtMzI2MDMgSW50ZXJuYWwgRXJyb3IgYnkgZGVmYXVsdDsgd2UgdGhyb3cgYSBwbGFpbiBFcnJvclxuICAgICAgICAgICAgICAgIC8vIHdpdGggYSBoZWxwZnVsIG1lc3NhZ2UgaW5jbHVkaW5nIHRoZSBhdmFpbGFibGUgbmFtZXMuXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHByb21wdDogJHtuYW1lfS4gQXZhaWxhYmxlOiAke3RoaXMucHJvbXB0cy5rbm93bk5hbWVzKCkuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFNESydzIEdldFByb21wdFJlc3VsdCB0eXBlIGNhcnJpZXMgYSBkaXNjcmltaW5hdGVkIHVuaW9uXG4gICAgICAgICAgICAvLyAob25lIGJyYW5jaCByZXF1aXJlcyBhIGB0YXNrYCBmaWVsZCkuIE91ciBjb250ZW50IG1hdGNoZXNcbiAgICAgICAgICAgIC8vIHRoZSBzaW1wbGUtcHJvbXB0IGJyYW5jaDsgY2FzdCB0aHJvdWdoIHVua25vd24gdG8gc2F0aXNmeVxuICAgICAgICAgICAgLy8gdGhlIHN0cnVjdHVyYWwgY2hlY2sgd2l0aG91dCBidXlpbmcgaW50byB0aGUgdGFzayBicmFuY2guXG4gICAgICAgICAgICByZXR1cm4gY29udGVudCBhcyB1bmtub3duIGFzIGFueTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzZGtTZXJ2ZXI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdE5hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdGggPSAoRWRpdG9yIGFzIGFueSk/LlByb2plY3Q/LnBhdGggYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAvLyBMYXN0IHBhdGggc2VnbWVudCB1c3VhbGx5IHRoZSBwcm9qZWN0IGZvbGRlciBuYW1lOyBmYWxsIGJhY2tcbiAgICAgICAgICAgICAgICAvLyB0byBcIih1bmtub3duKVwiIGlmIEVkaXRvciBpc24ndCByZWFkeS5cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoL1tcXFxcL10vKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdID8/ICcodW5rbm93biknO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG4gICAgICAgIHJldHVybiAnKHVua25vd24pJztcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0UGF0aCgpOiBzdHJpbmcge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIChFZGl0b3IgYXMgYW55KT8uUHJvamVjdD8ucGF0aCA/PyAnKHVua25vd24pJztcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiAnKHVua25vd24pJzsgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFQtVjI1LTM6IGRpc3BhdGNoIGEgbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCB0byBldmVyeVxuICAgICAqIHNlc3Npb24gdGhhdCBwcmV2aW91c2x5IGNhbGxlZCByZXNvdXJjZXMvc3Vic2NyaWJlIG9uIHRoaXMgVVJJLlxuICAgICAqIENhbGxlZCBieSBCcm9hZGNhc3RCcmlkZ2UgYWZ0ZXIgaXRzIHBlci1VUkkgZGVib3VuY2UgZmlyZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBub3RpZnlSZXNvdXJjZVVwZGF0ZWQodXJpOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCk6IHNka1NlcnZlci5ub3RpZmljYXRpb24oLi4uKVxuICAgICAgICAvLyByZXR1cm5zIGEgUHJvbWlzZS4gV2l0aG91dCBhd2FpdC9jYXRjaCwgdHJhbnNwb3J0LWxldmVsIGZhaWx1cmVzXG4gICAgICAgIC8vIGJlY29tZSB1bmhhbmRsZWQgcmVqZWN0aW9ucyAoTm9kZSBwcmludHMgc2NhcnkgXCJVbmhhbmRsZWRQcm9taXNlUmVqZWN0aW9uXCJcbiAgICAgICAgLy8gYW5kIG1heSBleGl0IG9uIC0tdW5oYW5kbGVkLXJlamVjdGlvbnM9c3RyaWN0KS4gVXNlIHZvaWQrY2F0Y2ggc29cbiAgICAgICAgLy8gdGhlIGxvb3AgY29udGludWVzIGV2ZW4gaWYgb25lIHNlc3Npb24ncyB0cmFuc3BvcnQgaXMgaGFsZi1jbG9zZWQuXG4gICAgICAgIC8vIFNuYXBzaG90IHNlc3Npb24gbGlzdCAoY2xhdWRlIPCfn6EpIHNvIGEgc2Vzc2lvbiByZW1vdmVkIG1pZC1pdGVyYXRpb25cbiAgICAgICAgLy8gZG9lc24ndCBza2V3IHRoZSBxdWV1ZWQgbm90aWZpY2F0aW9ucy5cbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IEFycmF5LmZyb20odGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkuZmlsdGVyKHMgPT4gcy5zdWJzY3JpcHRpb25zLmhhcyh1cmkpKTtcbiAgICAgICAgaWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICB2b2lkIHNlc3Npb24uc2RrU2VydmVyLm5vdGlmaWNhdGlvbih7XG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCcsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7IHVyaSB9LFxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oYFtNQ1BTZXJ2ZXJdIG5vdGlmaWNhdGlvbiBwdXNoIGZhaWxlZCBmb3IgJHt1cml9OmAsIGVycj8ubWVzc2FnZSA/PyBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSByZXNvdXJjZXMvdXBkYXRlZCAke3VyaX0g4oaSICR7dGFyZ2V0cy5sZW5ndGh9IHNlc3Npb24ocylgKTtcbiAgICB9XG5cbiAgICAvLyBULVAxLTU6IFRvb2xSZXNwb25zZSDihpIgTUNQIENhbGxUb29sUmVzdWx0LiBGYWlsdXJlcyBjYXJyeSB0aGUgZXJyb3JcbiAgICAvLyBtZXNzYWdlIGluIHRleHQgY29udGVudCArIGlzRXJyb3IuIFN1Y2Nlc3NlcyBrZWVwIEpTT04uc3RyaW5naWZ5KHJlc3VsdClcbiAgICAvLyBpbiB0ZXh0IChiYWNrLWNvbXBhdCkgYW5kIHRoZSBwYXJzZWQgb2JqZWN0IGluIHN0cnVjdHVyZWRDb250ZW50LlxuICAgIHByaXZhdGUgYnVpbGRUb29sUmVzdWx0KHJlc3VsdDogYW55KSB7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBjb25zdCBtc2cgPSByZXN1bHQuZXJyb3IgPz8gcmVzdWx0Lm1lc3NhZ2UgPz8gJ1Rvb2wgZmFpbGVkJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IEpTT04uc3RyaW5naWZ5KG1zZykgfV0sXG4gICAgICAgICAgICAgICAgaXNFcnJvcjogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGV4dCA9IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogSlNPTi5zdHJpbmdpZnkocmVzdWx0KTtcbiAgICAgICAgY29uc3Qgb3V0OiB7IGNvbnRlbnQ6IEFycmF5PHsgdHlwZTogJ3RleHQnOyB0ZXh0OiBzdHJpbmcgfT47IHN0cnVjdHVyZWRDb250ZW50PzogYW55IH0gPSB7XG4gICAgICAgICAgICBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQgfV0sXG4gICAgICAgIH07XG4gICAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIG91dC5zdHJ1Y3R1cmVkQ29udGVudCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKCdbTUNQU2VydmVyXSBTZXJ2ZXIgaXMgYWxyZWFkeSBydW5uaW5nJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcblxuICAgICAgICBjb25zdCB7IHBvcnQgfSA9IHRoaXMuc2V0dGluZ3M7XG4gICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBTdGFydGluZyBIVFRQIHNlcnZlciBvbiBwb3J0ICR7cG9ydH0uLi5gKTtcbiAgICAgICAgdGhpcy5odHRwU2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIodGhpcy5oYW5kbGVIdHRwUmVxdWVzdC5iaW5kKHRoaXMpKTtcblxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLmxpc3Rlbihwb3J0LCAnMTI3LjAuMC4xJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSDinIUgSFRUUCBzZXJ2ZXIgc3RhcnRlZCBvbiBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH1gKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gSGVhbHRoIGNoZWNrOiBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vaGVhbHRoYCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIE1DUCBlbmRwb2ludDogIGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9tY3BgKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEub24oJ2Vycm9yJywgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSDinYwgRmFpbGVkIHRvIHN0YXJ0IHNlcnZlcjonLCBlcnIpO1xuICAgICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgW01DUFNlcnZlcl0gUG9ydCAke3BvcnR9IGlzIGFscmVhZHkgaW4gdXNlLiBQbGVhc2UgY2hhbmdlIHRoZSBwb3J0IGluIHNldHRpbmdzLmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBzZXRJbnRlcnZhbCBrZWVwcyB0aGUgTm9kZSBldmVudCBsb29wIGFsaXZlOyB1bnJlZiBzbyB3ZSBkb24ndFxuICAgICAgICAvLyBibG9jayBleHRlbnNpb24gdGVhcmRvd24gaWYgc3RvcCgpIHNvbWVob3cgZG9lc24ndCBydW4uXG4gICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5zd2VlcElkbGVTZXNzaW9ucygpLCBTRVNTSU9OX0NMRUFOVVBfSU5URVJWQUxfTVMpO1xuICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbC51bnJlZj8uKCk7XG5cbiAgICAgICAgLy8gVC1WMjUtMzogc3BpbiB1cCB0aGUgY29jb3MgYnJvYWRjYXN0IOKGkiBNQ1Agbm90aWZpY2F0aW9ucyBicmlkZ2UuXG4gICAgICAgIC8vIERpc2FibGVkIG91dHNpZGUgdGhlIGVkaXRvciBob3N0IChlLmcuIGhlYWRsZXNzIHNtb2tlIHJ1bnMpXG4gICAgICAgIC8vIGJlY2F1c2UgRWRpdG9yLk1lc3NhZ2UuX19wcm90ZWN0ZWRfXyBpc24ndCBhdmFpbGFibGUgdGhlcmU7XG4gICAgICAgIC8vIEJyb2FkY2FzdEJyaWRnZS5zdGFydCgpIGRldGVjdHMgdGhpcyBhbmQgbG9ncyBhIHdhcm5pbmcuXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0QnJpZGdlLnN0YXJ0KCh1cmkpID0+IHRoaXMubm90aWZ5UmVzb3VyY2VVcGRhdGVkKHVyaSkpO1xuXG4gICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSDwn5qAIE1DUCBTZXJ2ZXIgcmVhZHkgKCR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scylgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN3ZWVwSWRsZVNlc3Npb25zKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9ucy5zaXplID09PSAwKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGN1dG9mZiA9IERhdGUubm93KCkgLSBTRVNTSU9OX0lETEVfVElNRU9VVF9NUztcbiAgICAgICAgY29uc3Qgc3RhbGU6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy5zZXNzaW9ucykge1xuICAgICAgICAgICAgaWYgKGVudHJ5Lmxhc3RBY3Rpdml0eUF0IDwgY3V0b2ZmKSBzdGFsZS5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIHN0YWxlKSB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMuc2Vzc2lvbnMuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmICghZW50cnkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgZW50cnkudHJhbnNwb3J0LmNsb3NlKCkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gc3dlZXAgY2xvc2UgZXJyb3IgZm9yICR7aWR9OmAsIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3dlcHQgaWRsZSBzZXNzaW9uOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwVG9vbHMoKTogdm9pZCB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBuZXcgbGlzdCBsb2NhbGx5IGFuZCBvbmx5IHN3YXAgb25jZSBpdCdzIHJlYWR5LCBzbyB0aGF0XG4gICAgICAgIC8vIGEgY29uY3VycmVudCBMaXN0VG9vbHNSZXF1ZXN0IGNhbiBuZXZlciBvYnNlcnZlIGFuIGVtcHR5IGxpc3QuXG4gICAgICAgIGNvbnN0IGVuYWJsZWRGaWx0ZXIgPSB0aGlzLmVuYWJsZWRUb29scy5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IG5ldyBTZXQodGhpcy5lbmFibGVkVG9vbHMubWFwKHQgPT4gYCR7dC5jYXRlZ29yeX1fJHt0Lm5hbWV9YCkpXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgY29uc3QgbmV4dDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtjYXRlZ29yeSwgdG9vbFNldF0gb2YgT2JqZWN0LmVudHJpZXModGhpcy50b29scykpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcU5hbWUgPSBgJHtjYXRlZ29yeX1fJHt0b29sLm5hbWV9YDtcbiAgICAgICAgICAgICAgICBpZiAoZW5hYmxlZEZpbHRlciAmJiAhZW5hYmxlZEZpbHRlci5oYXMoZnFOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgLy8gVC1WMjMtMTogdGFnIGV2ZXJ5IG5vbi1wcmltYXJ5IHRvb2wgW3NwZWNpYWxpc3RdIHNvIEFJIHByZWZlcnNcbiAgICAgICAgICAgICAgICAvLyBleGVjdXRlX2phdmFzY3JpcHQgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMuIFRoZSB0d28gZXhlY3V0ZV8qXG4gICAgICAgICAgICAgICAgLy8gdG9vbHMgYWxyZWFkeSBjYXJyeSB0aGVpciBvd24gW3ByaW1hcnldL1tjb21wYXRdIHByZWZpeCBpblxuICAgICAgICAgICAgICAgIC8vIHRoZWlyIGRlc2NyaXB0aW9uIHRleHQg4oCUIGxlYXZlIHRob3NlIGFsb25lLlxuICAgICAgICAgICAgICAgIGNvbnN0IGRlc2MgPSB0b29sLmRlc2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFscmVhZHlUYWdnZWQgPSBkZXNjLnN0YXJ0c1dpdGgoJ1twcmltYXJ5XScpIHx8IGRlc2Muc3RhcnRzV2l0aCgnW2NvbXBhdF0nKSB8fCBkZXNjLnN0YXJ0c1dpdGgoJ1tzcGVjaWFsaXN0XScpO1xuICAgICAgICAgICAgICAgIG5leHQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGZxTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGFscmVhZHlUYWdnZWQgPyBkZXNjIDogYFtzcGVjaWFsaXN0XSAke2Rlc2N9YCxcbiAgICAgICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvb2wuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b29sc0xpc3QgPSBuZXh0O1xuXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gU2V0dXAgdG9vbHM6ICR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVRvb2xDYWxsKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgICAgIGNvbnN0IFtjYXRlZ29yeSwgLi4ucmVzdF0gPSB0b29sTmFtZS5zcGxpdCgnXycpO1xuICAgICAgICBjb25zdCBleGVjdXRvciA9IHRoaXMudG9vbHNbY2F0ZWdvcnldO1xuICAgICAgICBpZiAoIWV4ZWN1dG9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJHt0b29sTmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGV4ZWN1dG9yLmV4ZWN1dGUocmVzdC5qb2luKCdfJyksIGFyZ3MpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBdmFpbGFibGVUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9vbHNMaXN0O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzOiBhbnlbXSk6IHZvaWQge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFVwZGF0aW5nIGVuYWJsZWQgdG9vbHM6ICR7ZW5hYmxlZFRvb2xzLmxlbmd0aH0gdG9vbHNgKTtcbiAgICAgICAgdGhpcy5lbmFibGVkVG9vbHMgPSBlbmFibGVkVG9vbHM7XG4gICAgICAgIHRoaXMuc2V0dXBUb29scygpO1xuICAgICAgICAvLyBOb3RpZnkgYWxsIGxpdmUgc2Vzc2lvbnMgdGhhdCB0aGUgdG9vbCBsaXN0IGNoYW5nZWQuXG4gICAgICAgIGZvciAoY29uc3QgeyBzZGtTZXJ2ZXIgfSBvZiB0aGlzLnNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICAgICAgICBzZGtTZXJ2ZXIuc2VuZFRvb2xMaXN0Q2hhbmdlZCgpLmNhdGNoKCgpID0+IHsgLyogcGVlciBtYXkgaGF2ZSBkcm9wcGVkICovIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFNldHRpbmdzKCk6IE1DUFNlcnZlclNldHRpbmdzIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0dGluZ3M7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdHRwUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcGFyc2VkVXJsID0gdXJsLnBhcnNlKHJlcS51cmwgfHwgJycsIHRydWUpO1xuICAgICAgICBjb25zdCBwYXRobmFtZSA9IHBhcnNlZFVybC5wYXRobmFtZTtcblxuICAgICAgICAvLyBDT1JTIGlzIHdpbGRjYXJkIHNvIHRoZSBDb2NvcyBDcmVhdG9yIHBhbmVsIHdlYnZpZXcgKHdoaWNoIGxvYWRzXG4gICAgICAgIC8vIGZyb20gYSBgZmlsZTovL2Agb3IgYGRldnRvb2xzOi8vYCBvcmlnaW4pIGNhbiBoaXQgdGhpcyBlbmRwb2ludC5cbiAgICAgICAgLy8gVGhlIHNlcnZlciBvbmx5IGxpc3RlbnMgb24gMTI3LjAuMC4xLCBzbyBleHRlcm5hbCBhdHRhY2tlcnMgY2FuJ3RcbiAgICAgICAgLy8gcmVhY2ggaXQ7IHRoZSB3aWxkY2FyZCBkb2VzIG1lYW4gYW55IGxvY2FsIHdlYiBwYWdlIGluIHRoZSB1c2VyJ3NcbiAgICAgICAgLy8gYnJvd3NlciBjb3VsZCBwcm9iZSBpdCwgd2hpY2ggaXMgYWNjZXB0YWJsZSBmb3IgYSBkZXZlbG9wZXIgdG9vbC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gRVhDRVBUSU9OOiAvZ2FtZS8qIGVuZHBvaW50cyBhcmUgc2NvcGVkIHRvIGEgc3RyaWN0IG9yaWdpblxuICAgICAgICAvLyBhbGxvd2xpc3QgKHYyLjcuMCAjMiBmaXggb24gdjIuNi4wIHJldmlldyBXNykuIFRoZSByZWFzb25pbmc6XG4gICAgICAgIC8vIC9nYW1lL3Jlc3VsdCBpcyBhIHdyaXRlIGVuZHBvaW50IHRoYXQgbXV0YXRlcyB0aGUgc2luZ2xlLWZsaWdodFxuICAgICAgICAvLyBxdWV1ZSBzdGF0ZSBzaGFyZWQgYnkgQUxMIE1DUCBzZXNzaW9ucyBvbiB0aGlzIGhvc3QuIEEgbWFsaWNpb3VzXG4gICAgICAgIC8vIGxvY2FsIGJyb3dzZXIgdGFiIHdpdGggdGhlIHdpbGRjYXJkIENPUlMgY291bGQgdGltZSBhIFBPU1QgdG9cbiAgICAgICAgLy8gcmFjZSBhIGxlZ2l0aW1hdGUgY29tbWFuZCdzIHJlc3VsdC4gL2dhbWUvY29tbWFuZCBhbmRcbiAgICAgICAgLy8gL2dhbWUvc3RhdHVzIGFyZSByZWFkcyBidXQgdGhlIGxlZ2l0aW1hdGUgY2FsbGVyIChHYW1lRGVidWdDbGllbnRcbiAgICAgICAgLy8gcnVubmluZyBpbnNpZGUgY29jb3MgcHJldmlldyAvIGJyb3dzZXIgcHJldmlldykgaXMgd2VsbC1rbm93bi5cbiAgICAgICAgY29uc3QgaXNHYW1lRW5kcG9pbnQgPSBwYXRobmFtZT8uc3RhcnRzV2l0aCgnL2dhbWUvJykgPT09IHRydWU7XG4gICAgICAgIC8vIHYyLjguMCBULVYyOC0xIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ2xhdWRlIHNpbmdsZS1yZXZpZXdlciDwn5+hKTpcbiAgICAgICAgLy8gaG9pc3QgcmVzb2x2ZUdhbWVDb3JzT3JpZ2luIHNvIHRoZSBPUFRJT05TIGJyYW5jaCwgdGhlIHJlc3BvbnNlLVxuICAgICAgICAvLyBoZWFkZXIgYnJhbmNoLCBhbmQgdGhlIHBvc3QtQ09SUyA0MDMgZW5mb3JjZW1lbnQgKGxhdGVyIGluXG4gICAgICAgIC8vIHJlcXVlc3RIYW5kbGVyKSBzaGFyZSBvbmUgY2xhc3NpZmljYXRpb24gY2FsbC5cbiAgICAgICAgY29uc3QgZ2FtZUFjYW8gPSBpc0dhbWVFbmRwb2ludFxuICAgICAgICAgICAgPyByZXNvbHZlR2FtZUNvcnNPcmlnaW4ocmVxLmhlYWRlcnMub3JpZ2luKVxuICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICBpZiAoaXNHYW1lRW5kcG9pbnQpIHtcbiAgICAgICAgICAgIC8vIHYyLjguMCBULVYyOC0xIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ2xhdWRlIHNpbmdsZS1yZXZpZXdlciDwn5+hKTpcbiAgICAgICAgICAgIC8vIGVtaXQgVmFyeTogT3JpZ2luIG9uIEJPVEggYWxsb3ctIGFuZCBkZW55LSBicmFuY2hlcyBzbyBhIHNoYXJlZFxuICAgICAgICAgICAgLy8gYnJvd3NlciBjYWNoZSBjYW5ub3Qgc2VydmUgYSBjYWNoZWQgYWxsb3dlZC1vcmlnaW4gcmVzcG9uc2UgdG8gYVxuICAgICAgICAgICAgLy8gbGF0ZXIgZGlzYWxsb3dlZCBvcmlnaW4gKG9yIHZpY2UgdmVyc2EpLiBUaGUgaGVhZGVyIGlzIHNldCBvbmNlXG4gICAgICAgICAgICAvLyBoZXJlIHJlZ2FyZGxlc3Mgb2YgYWNhbyBvdXRjb21lLlxuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignVmFyeScsICdPcmlnaW4nKTtcbiAgICAgICAgICAgIGlmIChnYW1lQWNhbyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGdhbWVBY2FvKTtcbiAgICAgICAgICAgIH0gLy8gZWxzZTogb21pdCBBQ0FPIGVudGlyZWx5OyBicm93c2VycyB3aWxsIGJsb2NrIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIFJlamVjdCBwcmVmbGlnaHQgZnJvbSBkaXNhbGxvd2VkIG9yaWdpbnMgZmFzdCBzbyB0aGUgcmVxdWVzdFxuICAgICAgICAgICAgLy8gbmV2ZXIgcmVhY2hlcyB0aGUgcXVldWUgbG9naWMuXG4gICAgICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGdhbWVBY2FvID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAzKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULCBQT1NULCBPUFRJT05TJyk7XG4gICAgICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsICdDb250ZW50LVR5cGUnKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwNCk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsICcqJyk7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCwgUE9TVCwgT1BUSU9OUywgREVMRVRFJyk7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgJ0NvbnRlbnQtVHlwZSwgQXV0aG9yaXphdGlvbiwgbWNwLXNlc3Npb24taWQsIG1jcC1wcm90b2NvbC12ZXJzaW9uJyk7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdtY3Atc2Vzc2lvbi1pZCcpO1xuXG4gICAgICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDQpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL21jcCcpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZU1jcFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9oZWFsdGgnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICAvLyBULVYyNi0xOiBpbmNsdWRlIEdhbWVEZWJ1Z0NsaWVudCBsaXZlbmVzcyBzbyBBSSAvIHVzZXIgY2FuXG4gICAgICAgICAgICAgICAgLy8gdmVyaWZ5IHRoZSBwb2xsaW5nIGNsaWVudCBpcyB1cCBiZWZvcmUgaXNzdWluZ1xuICAgICAgICAgICAgICAgIC8vIGRlYnVnX2dhbWVfY29tbWFuZC5cbiAgICAgICAgICAgICAgICBjb25zdCBnYW1lQ2xpZW50ID0gZ2V0Q2xpZW50U3RhdHVzKCk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgICAgICAgICAgICAgICAgdG9vbHM6IHRoaXMudG9vbHNMaXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgZ2FtZUNsaWVudDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29ubmVjdGVkOiBnYW1lQ2xpZW50LmNvbm5lY3RlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RQb2xsQXQ6IGdhbWVDbGllbnQubGFzdFBvbGxBdCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuNy4wICMyOiBlbmZvcmNlIG9yaWdpbiBhbGxvd2xpc3QgZm9yIC9nYW1lLyogd3JpdGVzIHRvby5cbiAgICAgICAgICAgIC8vIEJyb3dzZXIgcHJlZmxpZ2h0IGlzIGFscmVhZHkgYmxvY2tlZCAoYWJvdmUpIGJ1dCBhIG5vbi1icm93c2VyXG4gICAgICAgICAgICAvLyBjbGllbnQgKG9yIGEgYnJvd3NlciB3aXRoIHNpbXBsZS1yZXF1ZXN0IGJ5cGFzcykgY2FuIHN0aWxsXG4gICAgICAgICAgICAvLyBQT1NUL0dFVC4gUmVqZWN0IDQwMyBoZXJlIHRvIGhhcmRlbiB0aGUgcXVldWUgYWdhaW5zdFxuICAgICAgICAgICAgLy8gY3Jvc3MtdGFiIGhpamFjay5cbiAgICAgICAgICAgIC8vIHYyLjguMCBULVYyOC0xOiByZXVzZSB0aGUgYWxyZWFkeS1jbGFzc2lmaWVkIGdhbWVBY2FvIGluc3RlYWQgb2ZcbiAgICAgICAgICAgIC8vIHJlLXJ1bm5pbmcgcmVzb2x2ZUdhbWVDb3JzT3JpZ2luIChjaGVhcCBjYWxsIGJ1dCBpdCBrZXB0IG9yaWdpblxuICAgICAgICAgICAgLy8gY2xhc3NpZmljYXRpb24gbG9naWMgaW4gdHdvIHBsYWNlcykuXG4gICAgICAgICAgICBpZiAoaXNHYW1lRW5kcG9pbnQgJiYgZ2FtZUFjYW8gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMywgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiAnb3JpZ2luIG5vdCBhbGxvd2VkIGZvciAvZ2FtZS8qIGVuZHBvaW50cycgfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFQtVjI2LTE6IEdhbWVEZWJ1Z0NsaWVudCBwb2xscyB0aGlzIGZvciB0aGUgbmV4dCBwZW5kaW5nIGNvbW1hbmQuXG4gICAgICAgICAgICAvLyBTaW5nbGUtZmxpZ2h0IHF1ZXVlIGxpdmVzIGluIGxpYi9nYW1lLWNvbW1hbmQtcXVldWUudHMuXG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvZ2FtZS9jb21tYW5kJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNtZCA9IGNvbnN1bWVQZW5kaW5nQ29tbWFuZCgpO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShjbWQgPz8gbnVsbCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9nYW1lL3Jlc3VsdCcgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRCb2R5KHJlcSk7XG4gICAgICAgICAgICAgICAgbGV0IHBhcnNlZDogYW55O1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoYm9keSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IG9rOiBmYWxzZSwgZXJyb3I6IGBJbnZhbGlkIEpTT046ICR7ZXJyLm1lc3NhZ2V9YCB9KSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBXMik6IHJlcXVpcmUgYm90aCBpZCAoc3RyaW5nKSBhbmRcbiAgICAgICAgICAgICAgICAvLyBzdWNjZXNzIChib29sZWFuKS4gV2l0aG91dCB0aGUgc3VjY2VzcyBjaGVjaywgYSBidWdneSBjbGllbnRcbiAgICAgICAgICAgICAgICAvLyBwb3N0aW5nIHtpZCwgZXJyb3J9IHdvdWxkIHNsaXAgdGhyb3VnaCBhbmQgZG93bnN0cmVhbSBjb2RlXG4gICAgICAgICAgICAgICAgLy8gd291bGQgdHJlYXQgc3VjY2VzcyAhPT0gZmFsc2UgYXMgdHJ1dGh5LlxuICAgICAgICAgICAgICAgIGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQuaWQgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXJzZWQuc3VjY2VzcyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiAnZXhwZWN0ZWQge2lkOiBzdHJpbmcsIHN1Y2Nlc3M6IGJvb2xlYW4sIGRhdGE/LCBlcnJvcj99JyB9KSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgYWNjZXB0ZWQgPSBzZXRDb21tYW5kUmVzdWx0KHBhcnNlZCk7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZChhY2NlcHRlZC5vayA/IDIwNCA6IDQwOSwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoYWNjZXB0ZWQub2sgPyAnJyA6IEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogYWNjZXB0ZWQucmVhc29uIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvZ2FtZS9zdGF0dXMnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KGdldENsaWVudFN0YXR1cygpKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS90b29scycgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyB0b29sczogdGhpcy5nZXRTaW1wbGlmaWVkVG9vbHNMaXN0KCkgfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZT8uc3RhcnRzV2l0aCgnL2FwaS8nKSAmJiByZXEubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZVNpbXBsZUFQSVJlcXVlc3QocmVxLCByZXMsIHBhdGhuYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTm90IGZvdW5kJyB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0gSFRUUCByZXF1ZXN0IGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgICAgIGlmICghcmVzLmhlYWRlcnNTZW50KSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNi4xOiA0MTMgc3VyZmFjZSBmb3IgYm9keS1jYXAgcmVqZWN0aW9ucyBzbyBjbGllbnRzXG4gICAgICAgICAgICAgICAgLy8gY2FuIGRpc3Rpbmd1aXNoIFwieW91IHNlbnQgdG9vIG11Y2hcIiBmcm9tIHNlcnZlciBmYXVsdHMuXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgQm9keVRvb0xhcmdlRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MTMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnJvci5tZXNzYWdlIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDUwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsIGRldGFpbHM6IGVycm9yPy5tZXNzYWdlIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlTWNwUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLmhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIC8vIEdFVCAoc2VydmVyLWluaXRpYXRlZCBTU0UpIGFuZCBERUxFVEUgKGV4cGxpY2l0IHNlc3Npb24gY2xvc2UpIGJvdGhcbiAgICAgICAgLy8gcmVxdWlyZSBhbiBleGlzdGluZyBzZXNzaW9uLiBQZXIgU3RyZWFtYWJsZSBIVFRQIHNwZWMsIEdFVCB3aXRob3V0XG4gICAgICAgIC8vIHNlc3Npb24gaXMgXCJtZXRob2Qgbm90IGFsbG93ZWRcIjsgREVMRVRFIHdpdGhvdXQgc2Vzc2lvbiBpcyBcIm5vdCBmb3VuZFwiLlxuICAgICAgICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHNlc3Npb25JZCA/IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoIWVudHJ5KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNHZXQgPSByZXEubWV0aG9kID09PSAnR0VUJztcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKGlzR2V0ID8gNDA1IDogNDA0LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyMDAwLCBpc0dldFxuICAgICAgICAgICAgICAgICAgICA/ICdNZXRob2Qgbm90IGFsbG93ZWQgd2l0aG91dCBhY3RpdmUgc2Vzc2lvbidcbiAgICAgICAgICAgICAgICAgICAgOiAnU2Vzc2lvbiBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZW50cnkubGFzdEFjdGl2aXR5QXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgZW50cnkudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUE9TVDogcmVhZCBib2R5IG9uY2Ugc28gd2UgY2FuIGRldGVjdCBpbml0aWFsaXplIGJlZm9yZSBkaXNwYXRjaC5cbiAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRCb2R5KHJlcSk7XG4gICAgICAgIGxldCBwYXJzZWRCb2R5OiBhbnk7XG4gICAgICAgIGlmIChib2R5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UoYm9keSk7XG4gICAgICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjcwMCxcbiAgICAgICAgICAgICAgICAgICAgYFBhcnNlIGVycm9yOiAke3BhcnNlRXJyb3IubWVzc2FnZX0uIEJvZHk6ICR7Ym9keS5zdWJzdHJpbmcoMCwgMjAwKX1gKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBzZXNzaW9uSWQgPyB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nLmxhc3RBY3Rpdml0eUF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGF3YWl0IGV4aXN0aW5nLnRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzLCBwYXJzZWRCb2R5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5ldyBzZXNzaW9uIG11c3QgY29tZSB3aXRoIGFuIGluaXRpYWxpemUgcmVxdWVzdC5cbiAgICAgICAgaWYgKCFpc0luaXRpYWxpemVSZXF1ZXN0KHBhcnNlZEJvZHkpKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyMDAwLCAnQmFkIFJlcXVlc3Q6IE5vIHZhbGlkIHNlc3Npb24gSUQgcHJvdmlkZWQnKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCdWlsZCB0aGUgU2VydmVyIGZpcnN0IHNvIHRoZSB0cmFuc3BvcnQgY2FsbGJhY2sgY2xvc3VyZSBjYXB0dXJlc1xuICAgICAgICAvLyBhbiBhbHJlYWR5LWluaXRpYWxpemVkIGJpbmRpbmcgKGF2b2lkcyBURFotc3R5bGUgb3JkZXJpbmcgc3VycHJpc2VzKS5cbiAgICAgICAgLy8gVC1WMjUtMzogcHJlLWNyZWF0ZSB0aGUgcGVyLXNlc3Npb24gc3Vic2NyaXB0aW9ucyBTZXQgYW5kIHBhc3MgaXRcbiAgICAgICAgLy8gaW50byBidWlsZFNka1NlcnZlciBzbyB0aGUgU3Vic2NyaWJlL1Vuc3Vic2NyaWJlIGhhbmRsZXJzIGFuZCB0aGVcbiAgICAgICAgLy8gU2Vzc2lvbkVudHJ5IGJvdGggcmVmZXJlbmNlIHRoZSBzYW1lIFNldCBpbnN0YW5jZS5cbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgICBjb25zdCBzZGtTZXJ2ZXIgPSB0aGlzLmJ1aWxkU2RrU2VydmVyKHN1YnNjcmlwdGlvbnMpO1xuICAgICAgICBjb25zdCB0cmFuc3BvcnQgPSBuZXcgU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQoe1xuICAgICAgICAgICAgc2Vzc2lvbklkR2VuZXJhdG9yOiAoKSA9PiByYW5kb21VVUlEKCksXG4gICAgICAgICAgICBlbmFibGVKc29uUmVzcG9uc2U6IHRydWUsXG4gICAgICAgICAgICBvbnNlc3Npb25pbml0aWFsaXplZDogKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5zZXQoaWQsIHsgdHJhbnNwb3J0LCBzZGtTZXJ2ZXIsIGxhc3RBY3Rpdml0eUF0OiBEYXRlLm5vdygpLCBzdWJzY3JpcHRpb25zIH0pO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc2Vzc2lvbiBpbml0aWFsaXplZDogJHtpZH0gKHRvdGFsOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25zZXNzaW9uY2xvc2VkOiAoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzZXNzaW9uIGNsb3NlZDogJHtpZH0gKHJlbWFpbmluZzogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IHNka1NlcnZlci5jb25uZWN0KHRyYW5zcG9ydCk7XG4gICAgICAgIGF3YWl0IHRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzLCBwYXJzZWRCb2R5KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xlYW51cEludGVydmFsKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuY2xlYW51cEludGVydmFsKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICAvLyBULVYyNS0zOiB0ZWFyIGRvd24gdGhlIGJyaWRnZSBiZWZvcmUgY2xvc2luZyBzZXNzaW9ucyBzbyBhbnlcbiAgICAgICAgLy8gaW4tZmxpZ2h0IG5vdGlmaWNhdGlvbiB0aW1lcnMgYXJlIGNsZWFyZWQgYW5kIG5vIGxpc3RlbmVyc1xuICAgICAgICAvLyB0cnkgdG8gcHVzaCB0byBjbG9zZWQgdHJhbnNwb3J0cy5cbiAgICAgICAgdGhpcy5icm9hZGNhc3RCcmlkZ2Uuc3RvcCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgdHJhbnNwb3J0IH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0cmFuc3BvcnQuY2xvc2UoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybignW01DUFNlcnZlcl0gdHJhbnNwb3J0IGNsb3NlIGVycm9yOicsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Vzc2lvbnMuY2xlYXIoKTtcbiAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgLy8gY2xvc2UoKSBvbmx5IHJlZnVzZXMgTkVXIGNvbm5lY3Rpb25zOyBrZWVwLWFsaXZlIHNvY2tldHMgc3RheVxuICAgICAgICAgICAgLy8gb3BlbiBhbmQgd291bGQgYmxvY2sgY2xvc2UoKSBmb3JldmVyLiBGb3JjZSB0aGVtIHRvIGRyb3AgdG9vLlxuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyLmNsb3NlQWxsQ29ubmVjdGlvbnM/LigpO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5jbG9zZSgoKSA9PiByZXNvbHZlKCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIgPSBudWxsO1xuICAgICAgICAgICAgbG9nZ2VyLmluZm8oJ1tNQ1BTZXJ2ZXJdIEhUVFAgc2VydmVyIHN0b3BwZWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTdGF0dXMoKTogU2VydmVyU3RhdHVzIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJ1bm5pbmc6ICEhdGhpcy5odHRwU2VydmVyLFxuICAgICAgICAgICAgcG9ydDogdGhpcy5zZXR0aW5ncy5wb3J0LFxuICAgICAgICAgICAgY2xpZW50czogdGhpcy5zZXNzaW9ucy5zaXplLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHBhdGhuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcGF0aFBhcnRzID0gcGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIocCA9PiBwKTtcbiAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBBUEkgcGF0aC4gVXNlIC9hcGkve2NhdGVnb3J5fS97dG9vbF9uYW1lfScgfSkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGxUb29sTmFtZSA9IGAke3BhdGhQYXJ0c1sxXX1fJHtwYXRoUGFydHNbMl19YDtcblxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgbGV0IHBhcmFtczogYW55O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcGFyYW1zID0gYm9keSA/IEpTT04ucGFyc2UoYm9keSkgOiB7fTtcbiAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIEpTT04gaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgICAgICAgICBkZXRhaWxzOiBwYXJzZUVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWRCb2R5OiBib2R5LnN1YnN0cmluZygwLCAyMDApLFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVRvb2xDYWxsKGZ1bGxUb29sTmFtZSwgcGFyYW1zKTtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgdG9vbDogZnVsbFRvb2xOYW1lLCByZXN1bHQgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIFNpbXBsZSBBUEkgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgaWYgKCFyZXMuaGVhZGVyc1NlbnQpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDUwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIHRvb2w6IHBhdGhuYW1lIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpOiBhbnlbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdC5tYXAodG9vbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHRvb2wubmFtZS5zcGxpdCgnXycpO1xuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcnkgPSBwYXJ0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHRvb2xOYW1lID0gcGFydHMuc2xpY2UoMSkuam9pbignXycpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0b29sLm5hbWUsXG4gICAgICAgICAgICAgICAgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgdG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgYXBpUGF0aDogYC9hcGkvJHtjYXRlZ29yeX0vJHt0b29sTmFtZX1gLFxuICAgICAgICAgICAgICAgIGN1cmxFeGFtcGxlOiB0aGlzLmdlbmVyYXRlQ3VybEV4YW1wbGUoY2F0ZWdvcnksIHRvb2xOYW1lLCB0b29sLmlucHV0U2NoZW1hKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBzY2hlbWE6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHNhbXBsZVBhcmFtcyA9IHRoaXMuZ2VuZXJhdGVTYW1wbGVQYXJhbXMoc2NoZW1hKTtcbiAgICAgICAgY29uc3QganNvblN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHNhbXBsZVBhcmFtcywgbnVsbCwgMik7XG4gICAgICAgIHJldHVybiBgY3VybCAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLnNldHRpbmdzLnBvcnR9L2FwaS8ke2NhdGVnb3J5fS8ke3Rvb2xOYW1lfSBcXFxcXG4gIC1IIFwiQ29udGVudC1UeXBlOiBhcHBsaWNhdGlvbi9qc29uXCIgXFxcXFxuICAtZCAnJHtqc29uU3RyaW5nfSdgO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVTYW1wbGVQYXJhbXMoc2NoZW1hOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoIXNjaGVtYSB8fCAhc2NoZW1hLnByb3BlcnRpZXMpIHJldHVybiB7fTtcbiAgICAgICAgY29uc3Qgc2FtcGxlOiBhbnkgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcyBhcyBhbnkpKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9wU2NoZW1hID0gcHJvcCBhcyBhbnk7XG4gICAgICAgICAgICBzd2l0Y2ggKHByb3BTY2hlbWEudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/ICdleGFtcGxlX3N0cmluZyc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IDQyO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8geyB4OiAwLCB5OiAwLCB6OiAwIH07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gJ2V4YW1wbGVfdmFsdWUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzYW1wbGU7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy51cGRhdGluZykge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1BTZXJ2ZXJdIHVwZGF0ZVNldHRpbmdzIGlnbm9yZWQg4oCUIGFub3RoZXIgdXBkYXRlIGluIHByb2dyZXNzJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGluZyA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgICAgICBzZXREZWJ1Z0xvZ0VuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRGVidWdMb2cpO1xuICAgICAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IHBhbmVsIHRvZ2dsZXMgZm9yIGVuYWJsZUVkaXRvckNvbnRleHRFdmFsIG11c3RcbiAgICAgICAgICAgIC8vIHRha2UgZWZmZWN0IGltbWVkaWF0ZWx5LiBXaXRob3V0IHRoaXMgcmUtYXBwbHksIGRpc2FibGluZyB0aGVcbiAgICAgICAgICAgIC8vIHNldHRpbmcgYWZ0ZXIgZW5hYmxlIHdvdWxkIGxlYXZlIHRoZSBydW50aW1lIGZsYWcgT04gdW50aWwgdGhlXG4gICAgICAgICAgICAvLyBlbnRpcmUgZXh0ZW5zaW9uIHJlbG9hZHMg4oCUIGEgc2VjdXJpdHktcmVsZXZhbnQgZ2FwIGJlY2F1c2UgdGhlXG4gICAgICAgICAgICAvLyBlZGl0b3ItY29udGV4dCBldmFsIHdvdWxkIGtlZXAgYWNjZXB0aW5nIEFJLWdlbmVyYXRlZCBob3N0LXNpZGVcbiAgICAgICAgICAgIC8vIGNvZGUgZGVzcGl0ZSB0aGUgdXNlcidzIHBhbmVsIGNob2ljZS5cbiAgICAgICAgICAgIHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZChzZXR0aW5ncy5lbmFibGVFZGl0b3JDb250ZXh0RXZhbCA/PyBmYWxzZSk7XG4gICAgICAgICAgICAvLyB2Mi40LjggQTM6IHJlLWFwcGx5IHNjZW5lLWxvZy1jYXB0dXJlIGZsYWcgb24gZXZlcnkgc2V0dGluZ3NcbiAgICAgICAgICAgIC8vIGNoYW5nZSBzbyBwYW5lbCB0b2dnbGUgdGFrZXMgZWZmZWN0IGltbWVkaWF0ZWx5LCBtaXJyb3JpbmcgdGhlXG4gICAgICAgICAgICAvLyBlZGl0b3JDb250ZXh0RXZhbCByZS1hcHBseSBwYXR0ZXJuLlxuICAgICAgICAgICAgc2V0U2NlbmVMb2dDYXB0dXJlRW5hYmxlZChzZXR0aW5ncy5lbmFibGVTY2VuZUxvZ0NhcHR1cmUgPz8gdHJ1ZSk7XG4gICAgICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdG9wKCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyB2Mi43LjAgIzIgKFc3IGZyb20gdjIuNi4wIHJldmlldyk6IHJlc29sdmUgdGhlIEFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblxuLy8gaGVhZGVyIHZhbHVlIGZvciAvZ2FtZS8qIGVuZHBvaW50cy4gUmV0dXJuczpcbi8vICAgLSB0aGUgZWNobydkIG9yaWdpbiBzdHJpbmcgd2hlbiB0aGUgb3JpZ2luIGlzIGluIG91ciB0cnVzdCBsaXN0XG4vLyAgIC0gdGhlIGxpdGVyYWwgJ251bGwnIHN0cmluZyB3aGVuIHRoZSByZXF1ZXN0IGhhcyBPcmlnaW46IG51bGwgKGZpbGU6Ly9cbi8vICAgICBVUkxzIHNlbmQgdGhpczsgY29jb3MgUElFIHdlYnZpZXcgb2Z0ZW4gcnVucyBmcm9tIGZpbGU6Ly8pXG4vLyAgIC0gdGhlIHdpbGRjYXJkICcqJyBmb3Igbm8tT3JpZ2luIHJlcXVlc3RzIChjdXJsL05vZGUgY2xpZW50cywgc2FtZS1cbi8vICAgICBvcmlnaW4gcmVxdWVzdHMgdGhhdCBkb24ndCBzZW5kIE9yaWdpbikg4oCUIENPUlMgb25seSBtYXR0ZXJzIGluXG4vLyAgICAgYnJvd3NlcnMsIGFuZCBzYW1lLW9yaWdpbiAvIG5vLU9yaWdpbiBwYXRocyBjYW4ndCBiZSBjcm9zcy10YWJcbi8vICAgICBhdHRhY2tlcnNcbi8vICAgLSBudWxsICh0aGUgSlMgdmFsdWUpIHdoZW4gdGhlIG9yaWdpbiBpcyBkaXNhbGxvd2VkIOKGkiBjYWxsZXIgb21pdHMgdGhlXG4vLyAgICAgQUNBTyBoZWFkZXIgc28gYnJvd3NlcnMgYmxvY2sgdGhlIHJlc3BvbnNlXG5mdW5jdGlvbiByZXNvbHZlR2FtZUNvcnNPcmlnaW4ob3JpZ2luOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAob3JpZ2luID09PSB1bmRlZmluZWQgfHwgb3JpZ2luID09PSAnJykge1xuICAgICAgICAvLyBObyBPcmlnaW4gaGVhZGVyIOKGkiBub3QgYSBicm93c2VyIGZldGNoLiBBbGxvdy5cbiAgICAgICAgcmV0dXJuICcqJztcbiAgICB9XG4gICAgaWYgKG9yaWdpbiA9PT0gJ251bGwnKSB7XG4gICAgICAgIC8vIGZpbGU6Ly8gcGFnZXMgYW5kIHNvbWUgc2FuZGJveGVkIGlmcmFtZXMgc2VuZCAnbnVsbCcuIEFsbG93OlxuICAgICAgICAvLyBjb2NvcyBQSUUgd2VidmlldyBvZnRlbiBmYWxscyBpbnRvIHRoaXMgYnVja2V0LlxuICAgICAgICByZXR1cm4gJ251bGwnO1xuICAgIH1cbiAgICAvLyBBbGxvdyBsb29wYmFjayBIVFRQIG9yaWdpbnMgKGNvY29zIGJyb3dzZXIgcHJldmlldyBhdFxuICAgIC8vIGh0dHA6Ly9sb2NhbGhvc3Q6NzQ1NiBldGMuKSBhbmQgZGV2dG9vbHMvZmlsZSBzY2hlbWVzLlxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHUgPSBuZXcgVVJMKG9yaWdpbik7XG4gICAgICAgIGlmICh1LnByb3RvY29sID09PSAnZmlsZTonIHx8IHUucHJvdG9jb2wgPT09ICdkZXZ0b29sczonKSByZXR1cm4gb3JpZ2luO1xuICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY2xhdWRlIPCfn6EgKyBnZW1pbmkg8J+UtCk6IFdIQVRXRyBVUkwga2VlcHNcbiAgICAgICAgLy8gYnJhY2tldHMgYXJvdW5kIElQdjYgaG9zdG5hbWVzIG9uIE5vZGUgMTgrLCBidXQgb2xkZXIgYnVuZGxlZFxuICAgICAgICAvLyBOb2RlIGJ1aWxkcyBtYXkgc3RyaXAgdGhlbSDigJQgYWNjZXB0IGJvdGggdG8gYmUgcG9ydGFibGUgYWNyb3NzXG4gICAgICAgIC8vIHdoYXRldmVyIE5vZGUgdGhlIGNvY29zIGVkaXRvciBzaGlwcyBhdCBhbnkgZ2l2ZW4gdmVyc2lvbi5cbiAgICAgICAgaWYgKCh1LnByb3RvY29sID09PSAnaHR0cDonIHx8IHUucHJvdG9jb2wgPT09ICdodHRwczonKVxuICAgICAgICAgICAgJiYgKHUuaG9zdG5hbWUgPT09ICdsb2NhbGhvc3QnIHx8IHUuaG9zdG5hbWUgPT09ICcxMjcuMC4wLjEnXG4gICAgICAgICAgICAgICAgfHwgdS5ob3N0bmFtZSA9PT0gJ1s6OjFdJyB8fCB1Lmhvc3RuYW1lID09PSAnOjoxJykpIHtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW47XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTWFsZm9ybWVkIE9yaWdpbiBoZWFkZXIg4oaSIHJlamVjdC5cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8vIHYyLjYuMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIFcxKTogY2FwIHJlcXVlc3QgYm9kaWVzIGF0IDMyIE1CLlxuLy8gU2NyZWVuc2hvdHMgY29tZSBiYWNrIGFzIGRhdGEgVVJMcyB0aGF0IGNhbiBsZWdpdGltYXRlbHkgYmUgYSBmZXcgTUIgb25cbi8vIDRrIGNhbnZhc2VzLCBzbyB3ZSBzZXQgdGhlIGNhcCBnZW5lcm91c2x5IHJhdGhlciB0aGFuIHBlci1lbmRwb2ludC5cbi8vIEFib3ZlIHRoZSBjYXAgd2UgZGVzdHJveSB0aGUgY29ubmVjdGlvbiBzbyB0aGUgY2xpZW50IHNlZXMgYSBoYXJkIGNsb3NlXG4vLyByYXRoZXIgdGhhbiBhIHNsb3cgdHJ1dGhmdWwgNDEzIChhdm9pZHMgdGhlbSBjb250aW51aW5nIHRvIHN0cmVhbSkuXG5jb25zdCBNQVhfUkVRVUVTVF9CT0RZX0JZVEVTID0gMzIgKiAxMDI0ICogMTAyNDtcblxuY2xhc3MgQm9keVRvb0xhcmdlRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgcmVhZG9ubHkgc3RhdHVzQ29kZSA9IDQxMztcbiAgICBjb25zdHJ1Y3RvcigpIHsgc3VwZXIoYFJlcXVlc3QgYm9keSBleGNlZWRzICR7TUFYX1JFUVVFU1RfQk9EWV9CWVRFU30gYnl0ZXNgKTsgfVxufVxuXG5mdW5jdGlvbiByZWFkQm9keShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG4gICAgICAgIGxldCB0b3RhbCA9IDA7XG4gICAgICAgIHJlcS5vbignZGF0YScsIChjaHVuazogQnVmZmVyKSA9PiB7XG4gICAgICAgICAgICB0b3RhbCArPSBjaHVuay5sZW5ndGg7XG4gICAgICAgICAgICBpZiAodG90YWwgPiBNQVhfUkVRVUVTVF9CT0RZX0JZVEVTKSB7XG4gICAgICAgICAgICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEJvZHlUb29MYXJnZUVycm9yKCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNodW5rcy5wdXNoKGNodW5rKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcS5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKSkpO1xuICAgICAgICByZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICB9KTtcbn1cbiJdfQ==