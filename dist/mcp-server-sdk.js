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
const SERVER_VERSION = '2.8.0';
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
            // v2.9.x polish (Claude r1 single-🟡 from v2.8.1 review):
            // emit Vary: Origin uniformly across all branches so a future
            // change introducing dynamic ACAO on /mcp can't quietly
            // resurface the cache-poisoning issue T-V28-1 just hardened
            // against on /game/*. Cheap to set; never harmful.
            res.setHeader('Vary', 'Origin');
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
    // v2.8.1 round-1 fix (Codex 🟡 + Gemini 🟡): node http allows duplicate
    // Origin headers, which produces a string[] here. WHATWG URL would
    // serialize that to "a,b" and either throw or mis-classify. Treat as
    // disallowed — a legitimate browser sends exactly one Origin.
    if (Array.isArray(origin)) {
        return null;
    }
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
// v2.9.5 review fix (Gemini 🟡 + Codex 🟡): bumped 32 → 64 MB so
// MediaRecorder output at high bitrates (5-20 Mbps × 30-60s = 18-150 MB)
// has more headroom before the transport layer 413s. The host-side
// MAX_GAME_RECORDING_BYTES in debug-tools.ts is held identical so both
// caps move together; lower one to dial back if memory pressure becomes
// a concern.
const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFXNEM7QUFFNUMsbUNBQXVEO0FBQ3ZELHVEQUE2RjtBQUU3RixtREFBZ0Y7QUFDaEYsNkRBQXlEO0FBQ3pELGlEQUEwRTtBQUMxRSxpRUFJa0M7QUFFbEMsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDdkMsK0VBQStFO0FBQy9FLDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0UsMkRBQTJEO0FBQzNELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBWTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQWdCbEIsWUFBWSxRQUEyQixFQUFFLFFBQXNCOztRQWR2RCxlQUFVLEdBQXVCLElBQUksQ0FBQztRQUN0QyxhQUFRLEdBQThCLElBQUksR0FBRyxFQUFFLENBQUM7UUFJaEQsY0FBUyxHQUFxQixFQUFFLENBQUM7UUFDakMsaUJBQVksR0FBVSxFQUFFLENB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QyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDNUIsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIHVybCBmcm9tICd1cmwnO1xuaW1wb3J0IHsgcmFuZG9tVVVJRCB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9pbmRleC5qcyc7XG5pbXBvcnQgeyBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCB9IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL3N0cmVhbWFibGVIdHRwLmpzJztcbmltcG9ydCB7XG4gICAgQ2FsbFRvb2xSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RUb29sc1JlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFJlc291cmNlc1JlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFNjaGVtYSxcbiAgICBSZWFkUmVzb3VyY2VSZXF1ZXN0U2NoZW1hLFxuICAgIFN1YnNjcmliZVJlcXVlc3RTY2hlbWEsXG4gICAgVW5zdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RQcm9tcHRzUmVxdWVzdFNjaGVtYSxcbiAgICBHZXRQcm9tcHRSZXF1ZXN0U2NoZW1hLFxuICAgIGlzSW5pdGlhbGl6ZVJlcXVlc3QsXG59IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvdHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQU2VydmVyU2V0dGluZ3MsIFNlcnZlclN0YXR1cywgVG9vbERlZmluaXRpb24gfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHNldERlYnVnTG9nRW5hYmxlZCwgbG9nZ2VyIH0gZnJvbSAnLi9saWIvbG9nJztcbmltcG9ydCB7IHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZCwgc2V0U2NlbmVMb2dDYXB0dXJlRW5hYmxlZCB9IGZyb20gJy4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgVG9vbFJlZ2lzdHJ5IH0gZnJvbSAnLi90b29scy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBSZXNvdXJjZVJlZ2lzdHJ5LCBjcmVhdGVSZXNvdXJjZVJlZ2lzdHJ5IH0gZnJvbSAnLi9yZXNvdXJjZXMvcmVnaXN0cnknO1xuaW1wb3J0IHsgQnJvYWRjYXN0QnJpZGdlIH0gZnJvbSAnLi9saWIvYnJvYWRjYXN0LWJyaWRnZSc7XG5pbXBvcnQgeyBQcm9tcHRSZWdpc3RyeSwgY3JlYXRlUHJvbXB0UmVnaXN0cnkgfSBmcm9tICcuL3Byb21wdHMvcmVnaXN0cnknO1xuaW1wb3J0IHtcbiAgICBjb25zdW1lUGVuZGluZ0NvbW1hbmQsXG4gICAgc2V0Q29tbWFuZFJlc3VsdCxcbiAgICBnZXRDbGllbnRTdGF0dXMsXG59IGZyb20gJy4vbGliL2dhbWUtY29tbWFuZC1xdWV1ZSc7XG5cbmNvbnN0IFNFUlZFUl9OQU1FID0gJ2NvY29zLW1jcC1zZXJ2ZXInO1xuLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoZ2VtaW5pIPCflLQpOiBrZWVwIHRoaXMgaW4gc3luYyB3aXRoIHBhY2thZ2UuanNvbidzXG4vLyB2ZXJzaW9uIG9uIGV2ZXJ5IG1pbm9yL21ham9yIGJ1bXAuIFNESyBTZXJ2ZXIgaW5pdGlhbGl6ZSByZXNwb25zZSBjYXJyaWVzXG4vLyB0aGlzIHN0cmluZzsgY2xpZW50cyBzZWUgaXQgZHVyaW5nIE1DUCBoYW5kc2hha2UuIERyaWZ0IHNpbmNlIHYyLjAuMCBoYXNcbi8vIGJlZW4gY29uZnVzaW5nIHJldmlldyByb3VuZHMgYW5kIGxpdmUtdGVzdCB2ZXJpZmljYXRpb24uXG5jb25zdCBTRVJWRVJfVkVSU0lPTiA9ICcyLjguMCc7XG5cbi8vIElkbGUgc2Vzc2lvbiBzd2VlcDogZHJvcCBzZXNzaW9ucyB0aGF0IGhhdmVuJ3QgYmVlbiB0b3VjaGVkIGluIHRoaXMgbWFueSBtcy5cbi8vIFNldCBjb25zZXJ2YXRpdmVseSBsb25nIGZvciBlZGl0b3IgdXNhZ2Ugd2hlcmUgYSBkZXZlbG9wZXIgbWF5IHBhdXNlIHdvcmsuXG5jb25zdCBTRVNTSU9OX0lETEVfVElNRU9VVF9NUyA9IDMwICogNjAgKiAxMDAwO1xuY29uc3QgU0VTU0lPTl9DTEVBTlVQX0lOVEVSVkFMX01TID0gNjAgKiAxMDAwO1xuXG5pbnRlcmZhY2UgU2Vzc2lvbkVudHJ5IHtcbiAgICB0cmFuc3BvcnQ6IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0O1xuICAgIHNka1NlcnZlcjogU2VydmVyO1xuICAgIGxhc3RBY3Rpdml0eUF0OiBudW1iZXI7XG4gICAgLy8gVC1WMjUtMzogcGVyLXNlc3Npb24gcmVzb3VyY2UgVVJJIHN1YnNjcmlwdGlvbnMgZm9yXG4gICAgLy8gbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCBwdXNoLiBFbXB0eSBzZXQg4oaSIHNlc3Npb25cbiAgICAvLyBnZXRzIG5vIG5vdGlmaWNhdGlvbnMgZXZlbiBpZiB0aGUgYnJpZGdlIGZpcmVzLlxuICAgIHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+O1xufVxuXG5mdW5jdGlvbiBqc29uUnBjRXJyb3IoY29kZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh7IGpzb25ycGM6ICcyLjAnLCBlcnJvcjogeyBjb2RlLCBtZXNzYWdlIH0sIGlkOiBudWxsIH0pO1xufVxuXG4vKipcbiAqIE1DUCBzZXJ2ZXIgYmFja2VkIGJ5IHRoZSBvZmZpY2lhbCBAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrIFNlcnZlciArXG4gKiBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCAoc3RhdGVmdWwgbW9kZSkuXG4gKlxuICogRWFjaCBNQ1AgY2xpZW50IGdldHMgaXRzIG93biBTZXJ2ZXIgKyBUcmFuc3BvcnQgcGFpciBrZXllZCBieVxuICogYG1jcC1zZXNzaW9uLWlkYC4gSW5pdGlhbGl6ZSByZXF1ZXN0cyB3aXRoIG5vIHNlc3Npb24gaWQgbWludCBhIG5ldyBwYWlyLlxuICogUkVTVCBlbmRwb2ludHMgKC9oZWFsdGgsIC9hcGkvdG9vbHMsIC9hcGkve2NhdH0ve3Rvb2x9KSBzaGFyZSB0aGUgc2FtZVxuICogdW5kZXJseWluZyBodHRwLlNlcnZlci5cbiAqL1xuZXhwb3J0IGNsYXNzIE1DUFNlcnZlciB7XG4gICAgcHJpdmF0ZSBzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3M7XG4gICAgcHJpdmF0ZSBodHRwU2VydmVyOiBodHRwLlNlcnZlciB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFNlc3Npb25FbnRyeT4gPSBuZXcgTWFwKCk7XG4gICAgcHJpdmF0ZSB0b29sczogVG9vbFJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgcmVzb3VyY2VzOiBSZXNvdXJjZVJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgcHJvbXB0czogUHJvbXB0UmVnaXN0cnk7XG4gICAgcHJpdmF0ZSB0b29sc0xpc3Q6IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcbiAgICBwcml2YXRlIGVuYWJsZWRUb29sczogYW55W10gPSBbXTtcbiAgICBwcml2YXRlIGNsZWFudXBJbnRlcnZhbDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHVwZGF0aW5nOiBib29sZWFuID0gZmFsc2U7XG4gICAgLy8gVC1WMjUtMzogYnJpZGdlIGNvY29zIGVkaXRvciBJUEMgYnJvYWRjYXN0cyDihpIgTUNQXG4gICAgLy8gbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZC4gc3RhcnQoKS9zdG9wKCkgbGlmZWN5Y2xlXG4gICAgLy8gdGllZCB0byB0aGUgSFRUUCBzZXJ2ZXIuXG4gICAgcHJpdmF0ZSBicm9hZGNhc3RCcmlkZ2U6IEJyb2FkY2FzdEJyaWRnZSA9IG5ldyBCcm9hZGNhc3RCcmlkZ2UoKTtcblxuICAgIGNvbnN0cnVjdG9yKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncywgcmVnaXN0cnk6IFRvb2xSZWdpc3RyeSkge1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMudG9vbHMgPSByZWdpc3RyeTtcbiAgICAgICAgdGhpcy5yZXNvdXJjZXMgPSBjcmVhdGVSZXNvdXJjZVJlZ2lzdHJ5KHJlZ2lzdHJ5KTtcbiAgICAgICAgLy8gVC1WMjUtNDogcHJvbXB0cyByZWdpc3RyeSBiYWtlZCB3aXRoIHByb2plY3QgY29udGV4dCB0aGF0J3NcbiAgICAgICAgLy8gcmVzb2x2ZWQgbGF6aWx5IOKAlCBFZGl0b3IuUHJvamVjdCBtYXkgbm90IGJlIHJlYWR5IGF0IE1DUFNlcnZlclxuICAgICAgICAvLyBjb25zdHJ1Y3Rpb24gdGltZSBidXQgaXMgcmVsaWFibHkgYXZhaWxhYmxlIHdoZW4gcHJvbXB0cy9nZXRcbiAgICAgICAgLy8gaXMgY2FsbGVkLlxuICAgICAgICB0aGlzLnByb21wdHMgPSBjcmVhdGVQcm9tcHRSZWdpc3RyeSgoKSA9PiAoe1xuICAgICAgICAgICAgcHJvamVjdE5hbWU6IHRoaXMucmVzb2x2ZVByb2plY3ROYW1lKCksXG4gICAgICAgICAgICBwcm9qZWN0UGF0aDogdGhpcy5yZXNvbHZlUHJvamVjdFBhdGgoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZXREZWJ1Z0xvZ0VuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRGVidWdMb2cpO1xuICAgICAgICBzZXRFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRWRpdG9yQ29udGV4dEV2YWwgPz8gZmFsc2UpO1xuICAgICAgICBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkKHNldHRpbmdzLmVuYWJsZVNjZW5lTG9nQ2FwdHVyZSA/PyB0cnVlKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVc2luZyBzaGFyZWQgdG9vbCByZWdpc3RyeSAoJHtPYmplY3Qua2V5cyhyZWdpc3RyeSkubGVuZ3RofSBjYXRlZ29yaWVzKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRTZGtTZXJ2ZXIoc3Vic2NyaXB0aW9uczogU2V0PHN0cmluZz4pOiBTZXJ2ZXIge1xuICAgICAgICBjb25zdCBzZGtTZXJ2ZXIgPSBuZXcgU2VydmVyKFxuICAgICAgICAgICAgeyBuYW1lOiBTRVJWRVJfTkFNRSwgdmVyc2lvbjogU0VSVkVSX1ZFUlNJT04gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgdG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gVC1WMjUtMyAoVC1QMy0zKTogc3Vic2NyaWJlIGlzIG5vdyB0cnVlIOKAlCBjbGllbnRzIGNhblxuICAgICAgICAgICAgICAgICAgICAvLyByZXNvdXJjZXMvc3Vic2NyaWJlIHRvIGEgVVJJOyB0aGUgYnJvYWRjYXN0LWJyaWRnZVxuICAgICAgICAgICAgICAgICAgICAvLyBwdXNoZXMgbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBtYXBwZWQgY29jb3MgYnJvYWRjYXN0IGZpcmVzIChkZWJvdW5jZWQgcGVyIFVSSSkuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJGQyA2NTcwIHRlbXBsYXRlcyBhcmUgaW1wbGljaXRseSBzdXBwb3J0ZWQgYnkgcmVnaXN0ZXJpbmdcbiAgICAgICAgICAgICAgICAgICAgLy8gTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFNjaGVtYSBiZWxvdyDigJQgTUNQIHNwZWMgaGFzIG5vXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc291cmNlcy50ZW1wbGF0ZXMgY2FwYWJpbGl0eSBmbGFnIChjb2Nvcy1jbGknc1xuICAgICAgICAgICAgICAgICAgICAvLyBgdGVtcGxhdGVzOiB0cnVlYCBpcyBub24tc3BlYyBhbmQgd291bGQgYmUgc3RyaXBwZWQpLlxuICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IHsgbGlzdENoYW5nZWQ6IHRydWUsIHN1YnNjcmliZTogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBULVYyNS00IChULVAzLTIpOiA0IGJha2VkIHByb21wdCB0ZW1wbGF0ZXM7IG5vXG4gICAgICAgICAgICAgICAgICAgIC8vIGhvdC1yZWxvYWQgeWV0IHNvIGxpc3RDaGFuZ2VkIHN0YXlzIGZhbHNlLlxuICAgICAgICAgICAgICAgICAgICBwcm9tcHRzOiB7IGxpc3RDaGFuZ2VkOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0VG9vbHNSZXF1ZXN0U2NoZW1hLCBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgICAgdG9vbHM6IHRoaXMudG9vbHNMaXN0Lm1hcCh0ID0+ICh7XG4gICAgICAgICAgICAgICAgbmFtZTogdC5uYW1lLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB0LmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0LmlucHV0U2NoZW1hLFxuICAgICAgICAgICAgfSkpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihDYWxsVG9vbFJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IG5hbWUsIGFyZ3VtZW50czogYXJncyB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVRvb2xDYWxsKG5hbWUsIGFyZ3MgPz8ge30pO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmJ1aWxkVG9vbFJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcgYXMgY29uc3QsIHRleHQ6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9XSxcbiAgICAgICAgICAgICAgICAgICAgaXNFcnJvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RSZXNvdXJjZXNSZXF1ZXN0U2NoZW1hLCBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgICAgcmVzb3VyY2VzOiB0aGlzLnJlc291cmNlcy5saXN0KCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICByZXNvdXJjZVRlbXBsYXRlczogdGhpcy5yZXNvdXJjZXMubGlzdFRlbXBsYXRlcygpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihSZWFkUmVzb3VyY2VSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVzb3VyY2VzLnJlYWQodXJpKTtcbiAgICAgICAgICAgIHJldHVybiB7IGNvbnRlbnRzOiBbY29udGVudF0gfTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFQtVjI1LTM6IHBlci1zZXNzaW9uIHJlc291cmNlIHN1YnNjcmlwdGlvbiBoYW5kbGVycy4gVGhlXG4gICAgICAgIC8vIGBzdWJzY3JpcHRpb25zYCBTZXQgaXMgY2FwdHVyZWQgYXQgc2Vzc2lvbi1jcmVhdGlvbiB0aW1lIGFuZFxuICAgICAgICAvLyBzaGFyZWQgd2l0aCB0aGUgU2Vzc2lvbkVudHJ5IHNvIGBub3RpZnlSZXNvdXJjZVVwZGF0ZWRgXG4gICAgICAgIC8vIGNhbiBpdGVyYXRlIHNlc3Npb25zIGFuZCBjaGVjayBtZW1iZXJzaGlwIHdpdGhvdXQgYSBzZWNvbmRcbiAgICAgICAgLy8gbG9va3VwLlxuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoU3Vic2NyaWJlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMuYWRkKHVyaSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHN1YnNjcmliZSAke3VyaX0gKHNlc3Npb24gYWN0aXZlIHN1YnM6ICR7c3Vic2NyaXB0aW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihVbnN1YnNjcmliZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLmRlbGV0ZSh1cmkpO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSB1bnN1YnNjcmliZSAke3VyaX0gKHNlc3Npb24gYWN0aXZlIHN1YnM6ICR7c3Vic2NyaXB0aW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFQtVjI1LTQ6IHByb21wdHMvbGlzdCArIHByb21wdHMvZ2V0LiBTdGF0ZWxlc3MgKG5vIHNlc3Npb25cbiAgICAgICAgLy8gYWZmaW5pdHkgbmVlZGVkKTsgcmVuZGVyZWQgdGV4dCBiYWtlcyBpbiBwcm9qZWN0IGNvbnRleHQgYXRcbiAgICAgICAgLy8gY2FsbCB0aW1lIHNvIGEgcHJvamVjdCByZW5hbWUgaXMgcmVmbGVjdGVkIGltbWVkaWF0ZWx5LlxuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFByb21wdHNSZXF1ZXN0U2NoZW1hLCBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgICAgcHJvbXB0czogdGhpcy5wcm9tcHRzLmxpc3QoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoR2V0UHJvbXB0UmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgbmFtZSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5wcm9tcHRzLmdldChuYW1lKTtcbiAgICAgICAgICAgIGlmICghY29udGVudCkge1xuICAgICAgICAgICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUg8J+foSk6IHVua25vd25cbiAgICAgICAgICAgICAgICAvLyBwcm9tcHQgbmFtZXMgbXVzdCBzdXJmYWNlIGFzIEpTT04tUlBDIGVycm9ycyBwZXIgTUNQIHNwZWMsXG4gICAgICAgICAgICAgICAgLy8gbm90IGFzIHN1Y2Nlc3NmdWwgXCJQcm9tcHQgbm90IGZvdW5kXCIgY29udGVudCBib2RpZXMuXG4gICAgICAgICAgICAgICAgLy8gU0RLJ3MgUmVxdWVzdEhhbmRsZXIgY29udmVydHMgdGhyb3duIEVycm9ycyBpbnRvXG4gICAgICAgICAgICAgICAgLy8gLTMyNjAzIEludGVybmFsIEVycm9yIGJ5IGRlZmF1bHQ7IHdlIHRocm93IGEgcGxhaW4gRXJyb3JcbiAgICAgICAgICAgICAgICAvLyB3aXRoIGEgaGVscGZ1bCBtZXNzYWdlIGluY2x1ZGluZyB0aGUgYXZhaWxhYmxlIG5hbWVzLlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwcm9tcHQ6ICR7bmFtZX0uIEF2YWlsYWJsZTogJHt0aGlzLnByb21wdHMua25vd25OYW1lcygpLmpvaW4oJywgJyl9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTREsncyBHZXRQcm9tcHRSZXN1bHQgdHlwZSBjYXJyaWVzIGEgZGlzY3JpbWluYXRlZCB1bmlvblxuICAgICAgICAgICAgLy8gKG9uZSBicmFuY2ggcmVxdWlyZXMgYSBgdGFza2AgZmllbGQpLiBPdXIgY29udGVudCBtYXRjaGVzXG4gICAgICAgICAgICAvLyB0aGUgc2ltcGxlLXByb21wdCBicmFuY2g7IGNhc3QgdGhyb3VnaCB1bmtub3duIHRvIHNhdGlzZnlcbiAgICAgICAgICAgIC8vIHRoZSBzdHJ1Y3R1cmFsIGNoZWNrIHdpdGhvdXQgYnV5aW5nIGludG8gdGhlIHRhc2sgYnJhbmNoLlxuICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQgYXMgdW5rbm93biBhcyBhbnk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc2RrU2VydmVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3ROYW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwYXRoID0gKEVkaXRvciBhcyBhbnkpPy5Qcm9qZWN0Py5wYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmIChwYXRoKSB7XG4gICAgICAgICAgICAgICAgLy8gTGFzdCBwYXRoIHNlZ21lbnQgdXN1YWxseSB0aGUgcHJvamVjdCBmb2xkZXIgbmFtZTsgZmFsbCBiYWNrXG4gICAgICAgICAgICAgICAgLy8gdG8gXCIodW5rbm93bilcIiBpZiBFZGl0b3IgaXNuJ3QgcmVhZHkuXG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KC9bXFxcXC9dLykuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA/PyAnKHVua25vd24pJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuICAgICAgICByZXR1cm4gJyh1bmtub3duKSc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdFBhdGgoKTogc3RyaW5nIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiAoRWRpdG9yIGFzIGFueSk/LlByb2plY3Q/LnBhdGggPz8gJyh1bmtub3duKSc7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gJyh1bmtub3duKSc7IH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBULVYyNS0zOiBkaXNwYXRjaCBhIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgdG8gZXZlcnlcbiAgICAgKiBzZXNzaW9uIHRoYXQgcHJldmlvdXNseSBjYWxsZWQgcmVzb3VyY2VzL3N1YnNjcmliZSBvbiB0aGlzIFVSSS5cbiAgICAgKiBDYWxsZWQgYnkgQnJvYWRjYXN0QnJpZGdlIGFmdGVyIGl0cyBwZXItVVJJIGRlYm91bmNlIGZpcmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgbm90aWZ5UmVzb3VyY2VVcGRhdGVkKHVyaTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBzZGtTZXJ2ZXIubm90aWZpY2F0aW9uKC4uLilcbiAgICAgICAgLy8gcmV0dXJucyBhIFByb21pc2UuIFdpdGhvdXQgYXdhaXQvY2F0Y2gsIHRyYW5zcG9ydC1sZXZlbCBmYWlsdXJlc1xuICAgICAgICAvLyBiZWNvbWUgdW5oYW5kbGVkIHJlamVjdGlvbnMgKE5vZGUgcHJpbnRzIHNjYXJ5IFwiVW5oYW5kbGVkUHJvbWlzZVJlamVjdGlvblwiXG4gICAgICAgIC8vIGFuZCBtYXkgZXhpdCBvbiAtLXVuaGFuZGxlZC1yZWplY3Rpb25zPXN0cmljdCkuIFVzZSB2b2lkK2NhdGNoIHNvXG4gICAgICAgIC8vIHRoZSBsb29wIGNvbnRpbnVlcyBldmVuIGlmIG9uZSBzZXNzaW9uJ3MgdHJhbnNwb3J0IGlzIGhhbGYtY2xvc2VkLlxuICAgICAgICAvLyBTbmFwc2hvdCBzZXNzaW9uIGxpc3QgKGNsYXVkZSDwn5+hKSBzbyBhIHNlc3Npb24gcmVtb3ZlZCBtaWQtaXRlcmF0aW9uXG4gICAgICAgIC8vIGRvZXNuJ3Qgc2tldyB0aGUgcXVldWVkIG5vdGlmaWNhdGlvbnMuXG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBBcnJheS5mcm9tKHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpLmZpbHRlcihzID0+IHMuc3Vic2NyaXB0aW9ucy5oYXModXJpKSk7XG4gICAgICAgIGlmICh0YXJnZXRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgICAgICBmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgdm9pZCBzZXNzaW9uLnNka1NlcnZlci5ub3RpZmljYXRpb24oe1xuICAgICAgICAgICAgICAgIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQnLFxuICAgICAgICAgICAgICAgIHBhcmFtczogeyB1cmkgfSxcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKGBbTUNQU2VydmVyXSBub3RpZmljYXRpb24gcHVzaCBmYWlsZWQgZm9yICR7dXJpfTpgLCBlcnI/Lm1lc3NhZ2UgPz8gZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gcmVzb3VyY2VzL3VwZGF0ZWQgJHt1cml9IOKGkiAke3RhcmdldHMubGVuZ3RofSBzZXNzaW9uKHMpYCk7XG4gICAgfVxuXG4gICAgLy8gVC1QMS01OiBUb29sUmVzcG9uc2Ug4oaSIE1DUCBDYWxsVG9vbFJlc3VsdC4gRmFpbHVyZXMgY2FycnkgdGhlIGVycm9yXG4gICAgLy8gbWVzc2FnZSBpbiB0ZXh0IGNvbnRlbnQgKyBpc0Vycm9yLiBTdWNjZXNzZXMga2VlcCBKU09OLnN0cmluZ2lmeShyZXN1bHQpXG4gICAgLy8gaW4gdGV4dCAoYmFjay1jb21wYXQpIGFuZCB0aGUgcGFyc2VkIG9iamVjdCBpbiBzdHJ1Y3R1cmVkQ29udGVudC5cbiAgICBwcml2YXRlIGJ1aWxkVG9vbFJlc3VsdChyZXN1bHQ6IGFueSkge1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgY29uc3QgbXNnID0gcmVzdWx0LmVycm9yID8/IHJlc3VsdC5tZXNzYWdlID8/ICdUb29sIGZhaWxlZCc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBKU09OLnN0cmluZ2lmeShtc2cpIH1dLFxuICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRleHQgPSB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XG4gICAgICAgIGNvbnN0IG91dDogeyBjb250ZW50OiBBcnJheTx7IHR5cGU6ICd0ZXh0JzsgdGV4dDogc3RyaW5nIH0+OyBzdHJ1Y3R1cmVkQ29udGVudD86IGFueSB9ID0ge1xuICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dLFxuICAgICAgICB9O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBvdXQuc3RydWN0dXJlZENvbnRlbnQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnW01DUFNlcnZlcl0gU2VydmVyIGlzIGFscmVhZHkgcnVubmluZycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXR1cFRvb2xzKCk7XG5cbiAgICAgICAgY29uc3QgeyBwb3J0IH0gPSB0aGlzLnNldHRpbmdzO1xuICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gU3RhcnRpbmcgSFRUUCBzZXJ2ZXIgb24gcG9ydCAke3BvcnR9Li4uYCk7XG4gICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKHRoaXMuaGFuZGxlSHR0cFJlcXVlc3QuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5saXN0ZW4ocG9ydCwgJzEyNy4wLjAuMScsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0g4pyFIEhUVFAgc2VydmVyIHN0YXJ0ZWQgb24gaHR0cDovLzEyNy4wLjAuMToke3BvcnR9YCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIEhlYWx0aCBjaGVjazogaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L2hlYWx0aGApO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBNQ1AgZW5kcG9pbnQ6ICBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbWNwYCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLm9uKCdlcnJvcicsIChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0g4p2MIEZhaWxlZCB0byBzdGFydCBzZXJ2ZXI6JywgZXJyKTtcbiAgICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoYFtNQ1BTZXJ2ZXJdIFBvcnQgJHtwb3J0fSBpcyBhbHJlYWR5IGluIHVzZS4gUGxlYXNlIGNoYW5nZSB0aGUgcG9ydCBpbiBzZXR0aW5ncy5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gc2V0SW50ZXJ2YWwga2VlcHMgdGhlIE5vZGUgZXZlbnQgbG9vcCBhbGl2ZTsgdW5yZWYgc28gd2UgZG9uJ3RcbiAgICAgICAgLy8gYmxvY2sgZXh0ZW5zaW9uIHRlYXJkb3duIGlmIHN0b3AoKSBzb21laG93IGRvZXNuJ3QgcnVuLlxuICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHRoaXMuc3dlZXBJZGxlU2Vzc2lvbnMoKSwgU0VTU0lPTl9DTEVBTlVQX0lOVEVSVkFMX01TKTtcbiAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwudW5yZWY/LigpO1xuXG4gICAgICAgIC8vIFQtVjI1LTM6IHNwaW4gdXAgdGhlIGNvY29zIGJyb2FkY2FzdCDihpIgTUNQIG5vdGlmaWNhdGlvbnMgYnJpZGdlLlxuICAgICAgICAvLyBEaXNhYmxlZCBvdXRzaWRlIHRoZSBlZGl0b3IgaG9zdCAoZS5nLiBoZWFkbGVzcyBzbW9rZSBydW5zKVxuICAgICAgICAvLyBiZWNhdXNlIEVkaXRvci5NZXNzYWdlLl9fcHJvdGVjdGVkX18gaXNuJ3QgYXZhaWxhYmxlIHRoZXJlO1xuICAgICAgICAvLyBCcm9hZGNhc3RCcmlkZ2Uuc3RhcnQoKSBkZXRlY3RzIHRoaXMgYW5kIGxvZ3MgYSB3YXJuaW5nLlxuICAgICAgICB0aGlzLmJyb2FkY2FzdEJyaWRnZS5zdGFydCgodXJpKSA9PiB0aGlzLm5vdGlmeVJlc291cmNlVXBkYXRlZCh1cmkpKTtcblxuICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0g8J+agCBNQ1AgU2VydmVyIHJlYWR5ICgke3RoaXMudG9vbHNMaXN0Lmxlbmd0aH0gdG9vbHMpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzd2VlcElkbGVTZXNzaW9ucygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbnMuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gU0VTU0lPTl9JRExFX1RJTUVPVVRfTVM7XG4gICAgICAgIGNvbnN0IHN0YWxlOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMuc2Vzc2lvbnMpIHtcbiAgICAgICAgICAgIGlmIChlbnRyeS5sYXN0QWN0aXZpdHlBdCA8IGN1dG9mZikgc3RhbGUucHVzaChpZCk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBpZCBvZiBzdGFsZSkge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSB0aGlzLnNlc3Npb25zLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoIWVudHJ5KSBjb250aW51ZTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIGVudHJ5LnRyYW5zcG9ydC5jbG9zZSgpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oYFtNQ1BTZXJ2ZXJdIHN3ZWVwIGNsb3NlIGVycm9yIGZvciAke2lkfTpgLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHN3ZXB0IGlkbGUgc2Vzc2lvbjogJHtpZH0gKHJlbWFpbmluZzogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXR1cFRvb2xzKCk6IHZvaWQge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbmV3IGxpc3QgbG9jYWxseSBhbmQgb25seSBzd2FwIG9uY2UgaXQncyByZWFkeSwgc28gdGhhdFxuICAgICAgICAvLyBhIGNvbmN1cnJlbnQgTGlzdFRvb2xzUmVxdWVzdCBjYW4gbmV2ZXIgb2JzZXJ2ZSBhbiBlbXB0eSBsaXN0LlxuICAgICAgICBjb25zdCBlbmFibGVkRmlsdGVyID0gdGhpcy5lbmFibGVkVG9vbHMubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBuZXcgU2V0KHRoaXMuZW5hYmxlZFRvb2xzLm1hcCh0ID0+IGAke3QuY2F0ZWdvcnl9XyR7dC5uYW1lfWApKVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGNvbnN0IG5leHQ6IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBbY2F0ZWdvcnksIHRvb2xTZXRdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMudG9vbHMpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnFOYW1lID0gYCR7Y2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWA7XG4gICAgICAgICAgICAgICAgaWYgKGVuYWJsZWRGaWx0ZXIgJiYgIWVuYWJsZWRGaWx0ZXIuaGFzKGZxTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIC8vIFQtVjIzLTE6IHRhZyBldmVyeSBub24tcHJpbWFyeSB0b29sIFtzcGVjaWFsaXN0XSBzbyBBSSBwcmVmZXJzXG4gICAgICAgICAgICAgICAgLy8gZXhlY3V0ZV9qYXZhc2NyaXB0IGZvciBjb21wb3VuZCBvcGVyYXRpb25zLiBUaGUgdHdvIGV4ZWN1dGVfKlxuICAgICAgICAgICAgICAgIC8vIHRvb2xzIGFscmVhZHkgY2FycnkgdGhlaXIgb3duIFtwcmltYXJ5XS9bY29tcGF0XSBwcmVmaXggaW5cbiAgICAgICAgICAgICAgICAvLyB0aGVpciBkZXNjcmlwdGlvbiB0ZXh0IOKAlCBsZWF2ZSB0aG9zZSBhbG9uZS5cbiAgICAgICAgICAgICAgICBjb25zdCBkZXNjID0gdG9vbC5kZXNjcmlwdGlvbjtcbiAgICAgICAgICAgICAgICBjb25zdCBhbHJlYWR5VGFnZ2VkID0gZGVzYy5zdGFydHNXaXRoKCdbcHJpbWFyeV0nKSB8fCBkZXNjLnN0YXJ0c1dpdGgoJ1tjb21wYXRdJykgfHwgZGVzYy5zdGFydHNXaXRoKCdbc3BlY2lhbGlzdF0nKTtcbiAgICAgICAgICAgICAgICBuZXh0LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBmcU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBhbHJlYWR5VGFnZ2VkID8gZGVzYyA6IGBbc3BlY2lhbGlzdF0gJHtkZXNjfWAsXG4gICAgICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0b29sLmlucHV0U2NoZW1hLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9vbHNMaXN0ID0gbmV4dDtcblxuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFNldHVwIHRvb2xzOiAke3RoaXMudG9vbHNMaXN0Lmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVUb29sQ2FsbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICBjb25zdCBbY2F0ZWdvcnksIC4uLnJlc3RdID0gdG9vbE5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgY29uc3QgZXhlY3V0b3IgPSB0aGlzLnRvb2xzW2NhdGVnb3J5XTtcbiAgICAgICAgaWYgKCFleGVjdXRvcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleGVjdXRvci5leGVjdXRlKHJlc3Quam9pbignXycpLCBhcmdzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29sczogYW55W10pOiB2b2lkIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVcGRhdGluZyBlbmFibGVkIHRvb2xzOiAke2VuYWJsZWRUb29scy5sZW5ndGh9IHRvb2xzYCk7XG4gICAgICAgIHRoaXMuZW5hYmxlZFRvb2xzID0gZW5hYmxlZFRvb2xzO1xuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcbiAgICAgICAgLy8gTm90aWZ5IGFsbCBsaXZlIHNlc3Npb25zIHRoYXQgdGhlIHRvb2wgbGlzdCBjaGFuZ2VkLlxuICAgICAgICBmb3IgKGNvbnN0IHsgc2RrU2VydmVyIH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgc2RrU2VydmVyLnNlbmRUb29sTGlzdENoYW5nZWQoKS5jYXRjaCgoKSA9PiB7IC8qIHBlZXIgbWF5IGhhdmUgZHJvcHBlZCAqLyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTZXR0aW5ncygpOiBNQ1BTZXJ2ZXJTZXR0aW5ncyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlSHR0cFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFVybCA9IHVybC5wYXJzZShyZXEudXJsIHx8ICcnLCB0cnVlKTtcbiAgICAgICAgY29uc3QgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cbiAgICAgICAgLy8gQ09SUyBpcyB3aWxkY2FyZCBzbyB0aGUgQ29jb3MgQ3JlYXRvciBwYW5lbCB3ZWJ2aWV3ICh3aGljaCBsb2Fkc1xuICAgICAgICAvLyBmcm9tIGEgYGZpbGU6Ly9gIG9yIGBkZXZ0b29sczovL2Agb3JpZ2luKSBjYW4gaGl0IHRoaXMgZW5kcG9pbnQuXG4gICAgICAgIC8vIFRoZSBzZXJ2ZXIgb25seSBsaXN0ZW5zIG9uIDEyNy4wLjAuMSwgc28gZXh0ZXJuYWwgYXR0YWNrZXJzIGNhbid0XG4gICAgICAgIC8vIHJlYWNoIGl0OyB0aGUgd2lsZGNhcmQgZG9lcyBtZWFuIGFueSBsb2NhbCB3ZWIgcGFnZSBpbiB0aGUgdXNlcidzXG4gICAgICAgIC8vIGJyb3dzZXIgY291bGQgcHJvYmUgaXQsIHdoaWNoIGlzIGFjY2VwdGFibGUgZm9yIGEgZGV2ZWxvcGVyIHRvb2wuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEVYQ0VQVElPTjogL2dhbWUvKiBlbmRwb2ludHMgYXJlIHNjb3BlZCB0byBhIHN0cmljdCBvcmlnaW5cbiAgICAgICAgLy8gYWxsb3dsaXN0ICh2Mi43LjAgIzIgZml4IG9uIHYyLjYuMCByZXZpZXcgVzcpLiBUaGUgcmVhc29uaW5nOlxuICAgICAgICAvLyAvZ2FtZS9yZXN1bHQgaXMgYSB3cml0ZSBlbmRwb2ludCB0aGF0IG11dGF0ZXMgdGhlIHNpbmdsZS1mbGlnaHRcbiAgICAgICAgLy8gcXVldWUgc3RhdGUgc2hhcmVkIGJ5IEFMTCBNQ1Agc2Vzc2lvbnMgb24gdGhpcyBob3N0LiBBIG1hbGljaW91c1xuICAgICAgICAvLyBsb2NhbCBicm93c2VyIHRhYiB3aXRoIHRoZSB3aWxkY2FyZCBDT1JTIGNvdWxkIHRpbWUgYSBQT1NUIHRvXG4gICAgICAgIC8vIHJhY2UgYSBsZWdpdGltYXRlIGNvbW1hbmQncyByZXN1bHQuIC9nYW1lL2NvbW1hbmQgYW5kXG4gICAgICAgIC8vIC9nYW1lL3N0YXR1cyBhcmUgcmVhZHMgYnV0IHRoZSBsZWdpdGltYXRlIGNhbGxlciAoR2FtZURlYnVnQ2xpZW50XG4gICAgICAgIC8vIHJ1bm5pbmcgaW5zaWRlIGNvY29zIHByZXZpZXcgLyBicm93c2VyIHByZXZpZXcpIGlzIHdlbGwta25vd24uXG4gICAgICAgIGNvbnN0IGlzR2FtZUVuZHBvaW50ID0gcGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9nYW1lLycpID09PSB0cnVlO1xuICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMSAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENsYXVkZSBzaW5nbGUtcmV2aWV3ZXIg8J+foSk6XG4gICAgICAgIC8vIGhvaXN0IHJlc29sdmVHYW1lQ29yc09yaWdpbiBzbyB0aGUgT1BUSU9OUyBicmFuY2gsIHRoZSByZXNwb25zZS1cbiAgICAgICAgLy8gaGVhZGVyIGJyYW5jaCwgYW5kIHRoZSBwb3N0LUNPUlMgNDAzIGVuZm9yY2VtZW50IChsYXRlciBpblxuICAgICAgICAvLyByZXF1ZXN0SGFuZGxlcikgc2hhcmUgb25lIGNsYXNzaWZpY2F0aW9uIGNhbGwuXG4gICAgICAgIGNvbnN0IGdhbWVBY2FvID0gaXNHYW1lRW5kcG9pbnRcbiAgICAgICAgICAgID8gcmVzb2x2ZUdhbWVDb3JzT3JpZ2luKHJlcS5oZWFkZXJzLm9yaWdpbilcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgaWYgKGlzR2FtZUVuZHBvaW50KSB7XG4gICAgICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMSAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENsYXVkZSBzaW5nbGUtcmV2aWV3ZXIg8J+foSk6XG4gICAgICAgICAgICAvLyBlbWl0IFZhcnk6IE9yaWdpbiBvbiBCT1RIIGFsbG93LSBhbmQgZGVueS0gYnJhbmNoZXMgc28gYSBzaGFyZWRcbiAgICAgICAgICAgIC8vIGJyb3dzZXIgY2FjaGUgY2Fubm90IHNlcnZlIGEgY2FjaGVkIGFsbG93ZWQtb3JpZ2luIHJlc3BvbnNlIHRvIGFcbiAgICAgICAgICAgIC8vIGxhdGVyIGRpc2FsbG93ZWQgb3JpZ2luIChvciB2aWNlIHZlcnNhKS4gVGhlIGhlYWRlciBpcyBzZXQgb25jZVxuICAgICAgICAgICAgLy8gaGVyZSByZWdhcmRsZXNzIG9mIGFjYW8gb3V0Y29tZS5cbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ1ZhcnknLCAnT3JpZ2luJyk7XG4gICAgICAgICAgICBpZiAoZ2FtZUFjYW8gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCBnYW1lQWNhbyk7XG4gICAgICAgICAgICB9IC8vIGVsc2U6IG9taXQgQUNBTyBlbnRpcmVseTsgYnJvd3NlcnMgd2lsbCBibG9jayB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBSZWplY3QgcHJlZmxpZ2h0IGZyb20gZGlzYWxsb3dlZCBvcmlnaW5zIGZhc3Qgc28gdGhlIHJlcXVlc3RcbiAgICAgICAgICAgIC8vIG5ldmVyIHJlYWNoZXMgdGhlIHF1ZXVlIGxvZ2ljLlxuICAgICAgICAgICAgaWYgKHJlcS5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgICAgICAgICAgIGlmIChnYW1lQWNhbyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMyk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCwgUE9TVCwgT1BUSU9OUycpO1xuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCAnQ29udGVudC1UeXBlJyk7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDQpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ2xhdWRlIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6XG4gICAgICAgICAgICAvLyBlbWl0IFZhcnk6IE9yaWdpbiB1bmlmb3JtbHkgYWNyb3NzIGFsbCBicmFuY2hlcyBzbyBhIGZ1dHVyZVxuICAgICAgICAgICAgLy8gY2hhbmdlIGludHJvZHVjaW5nIGR5bmFtaWMgQUNBTyBvbiAvbWNwIGNhbid0IHF1aWV0bHlcbiAgICAgICAgICAgIC8vIHJlc3VyZmFjZSB0aGUgY2FjaGUtcG9pc29uaW5nIGlzc3VlIFQtVjI4LTEganVzdCBoYXJkZW5lZFxuICAgICAgICAgICAgLy8gYWdhaW5zdCBvbiAvZ2FtZS8qLiBDaGVhcCB0byBzZXQ7IG5ldmVyIGhhcm1mdWwuXG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdWYXJ5JywgJ09yaWdpbicpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsIFBPU1QsIE9QVElPTlMsIERFTEVURScpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24sIG1jcC1zZXNzaW9uLWlkLCBtY3AtcHJvdG9jb2wtdmVyc2lvbicpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnbWNwLXNlc3Npb24taWQnKTtcblxuICAgICAgICAgICAgaWYgKHJlcS5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjA0KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9tY3AnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVNY3BSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvaGVhbHRoJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgLy8gVC1WMjYtMTogaW5jbHVkZSBHYW1lRGVidWdDbGllbnQgbGl2ZW5lc3Mgc28gQUkgLyB1c2VyIGNhblxuICAgICAgICAgICAgICAgIC8vIHZlcmlmeSB0aGUgcG9sbGluZyBjbGllbnQgaXMgdXAgYmVmb3JlIGlzc3VpbmdcbiAgICAgICAgICAgICAgICAvLyBkZWJ1Z19nYW1lX2NvbW1hbmQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ2FtZUNsaWVudCA9IGdldENsaWVudFN0YXR1cygpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICAgICAgICAgICAgICAgIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGdhbWVDbGllbnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbm5lY3RlZDogZ2FtZUNsaWVudC5jb25uZWN0ZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXN0UG9sbEF0OiBnYW1lQ2xpZW50Lmxhc3RQb2xsQXQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjcuMCAjMjogZW5mb3JjZSBvcmlnaW4gYWxsb3dsaXN0IGZvciAvZ2FtZS8qIHdyaXRlcyB0b28uXG4gICAgICAgICAgICAvLyBCcm93c2VyIHByZWZsaWdodCBpcyBhbHJlYWR5IGJsb2NrZWQgKGFib3ZlKSBidXQgYSBub24tYnJvd3NlclxuICAgICAgICAgICAgLy8gY2xpZW50IChvciBhIGJyb3dzZXIgd2l0aCBzaW1wbGUtcmVxdWVzdCBieXBhc3MpIGNhbiBzdGlsbFxuICAgICAgICAgICAgLy8gUE9TVC9HRVQuIFJlamVjdCA0MDMgaGVyZSB0byBoYXJkZW4gdGhlIHF1ZXVlIGFnYWluc3RcbiAgICAgICAgICAgIC8vIGNyb3NzLXRhYiBoaWphY2suXG4gICAgICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMTogcmV1c2UgdGhlIGFscmVhZHktY2xhc3NpZmllZCBnYW1lQWNhbyBpbnN0ZWFkIG9mXG4gICAgICAgICAgICAvLyByZS1ydW5uaW5nIHJlc29sdmVHYW1lQ29yc09yaWdpbiAoY2hlYXAgY2FsbCBidXQgaXQga2VwdCBvcmlnaW5cbiAgICAgICAgICAgIC8vIGNsYXNzaWZpY2F0aW9uIGxvZ2ljIGluIHR3byBwbGFjZXMpLlxuICAgICAgICAgICAgaWYgKGlzR2FtZUVuZHBvaW50ICYmIGdhbWVBY2FvID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogJ29yaWdpbiBub3QgYWxsb3dlZCBmb3IgL2dhbWUvKiBlbmRwb2ludHMnIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgcG9sbHMgdGhpcyBmb3IgdGhlIG5leHQgcGVuZGluZyBjb21tYW5kLlxuICAgICAgICAgICAgLy8gU2luZ2xlLWZsaWdodCBxdWV1ZSBsaXZlcyBpbiBsaWIvZ2FtZS1jb21tYW5kLXF1ZXVlLnRzLlxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvY29tbWFuZCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbWQgPSBjb25zdW1lUGVuZGluZ0NvbW1hbmQoKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoY21kID8/IG51bGwpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvZ2FtZS9yZXN1bHQnICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICAgICAgICAgIGxldCBwYXJzZWQ6IGFueTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBwYXJzZWQgPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiBgSW52YWxpZCBKU09OOiAke2Vyci5tZXNzYWdlfWAgfSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjbGF1ZGUgVzIpOiByZXF1aXJlIGJvdGggaWQgKHN0cmluZykgYW5kXG4gICAgICAgICAgICAgICAgLy8gc3VjY2VzcyAoYm9vbGVhbikuIFdpdGhvdXQgdGhlIHN1Y2Nlc3MgY2hlY2ssIGEgYnVnZ3kgY2xpZW50XG4gICAgICAgICAgICAgICAgLy8gcG9zdGluZyB7aWQsIGVycm9yfSB3b3VsZCBzbGlwIHRocm91Z2ggYW5kIGRvd25zdHJlYW0gY29kZVxuICAgICAgICAgICAgICAgIC8vIHdvdWxkIHRyZWF0IHN1Y2Nlc3MgIT09IGZhbHNlIGFzIHRydXRoeS5cbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLmlkICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFyc2VkLnN1Y2Nlc3MgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogJ2V4cGVjdGVkIHtpZDogc3RyaW5nLCBzdWNjZXNzOiBib29sZWFuLCBkYXRhPywgZXJyb3I/fScgfSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGFjY2VwdGVkID0gc2V0Q29tbWFuZFJlc3VsdChwYXJzZWQpO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoYWNjZXB0ZWQub2sgPyAyMDQgOiA0MDksIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGFjY2VwdGVkLm9rID8gJycgOiBKU09OLnN0cmluZ2lmeSh7IG9rOiBmYWxzZSwgZXJyb3I6IGFjY2VwdGVkLnJlYXNvbiB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvc3RhdHVzJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShnZXRDbGllbnRTdGF0dXMoKSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvdG9vbHMnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgdG9vbHM6IHRoaXMuZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9hcGkvJykgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcSwgcmVzLCBwYXRobmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ05vdCBmb3VuZCcgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIEhUVFAgcmVxdWVzdCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIC8vIHYyLjYuMTogNDEzIHN1cmZhY2UgZm9yIGJvZHktY2FwIHJlamVjdGlvbnMgc28gY2xpZW50c1xuICAgICAgICAgICAgICAgIC8vIGNhbiBkaXN0aW5ndWlzaCBcInlvdSBzZW50IHRvbyBtdWNoXCIgZnJvbSBzZXJ2ZXIgZmF1bHRzLlxuICAgICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEJvZHlUb29MYXJnZUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDEzLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogZXJyb3IubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLCBkZXRhaWxzOiBlcnJvcj8ubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZU1jcFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcS5oZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBHRVQgKHNlcnZlci1pbml0aWF0ZWQgU1NFKSBhbmQgREVMRVRFIChleHBsaWNpdCBzZXNzaW9uIGNsb3NlKSBib3RoXG4gICAgICAgIC8vIHJlcXVpcmUgYW4gZXhpc3Rpbmcgc2Vzc2lvbi4gUGVyIFN0cmVhbWFibGUgSFRUUCBzcGVjLCBHRVQgd2l0aG91dFxuICAgICAgICAvLyBzZXNzaW9uIGlzIFwibWV0aG9kIG5vdCBhbGxvd2VkXCI7IERFTEVURSB3aXRob3V0IHNlc3Npb24gaXMgXCJub3QgZm91bmRcIi5cbiAgICAgICAgaWYgKHJlcS5tZXRob2QgIT09ICdQT1NUJykge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBzZXNzaW9uSWQgPyB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFlbnRyeSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzR2V0ID0gcmVxLm1ldGhvZCA9PT0gJ0dFVCc7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZChpc0dldCA/IDQwNSA6IDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjAwMCwgaXNHZXRcbiAgICAgICAgICAgICAgICAgICAgPyAnTWV0aG9kIG5vdCBhbGxvd2VkIHdpdGhvdXQgYWN0aXZlIHNlc3Npb24nXG4gICAgICAgICAgICAgICAgICAgIDogJ1Nlc3Npb24gbm90IGZvdW5kJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVudHJ5Lmxhc3RBY3Rpdml0eUF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGF3YWl0IGVudHJ5LnRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBPU1Q6IHJlYWQgYm9keSBvbmNlIHNvIHdlIGNhbiBkZXRlY3QgaW5pdGlhbGl6ZSBiZWZvcmUgZGlzcGF0Y2guXG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBsZXQgcGFyc2VkQm9keTogYW55O1xuICAgICAgICBpZiAoYm9keS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHBhcnNlZEJvZHkgPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzI3MDAsXG4gICAgICAgICAgICAgICAgICAgIGBQYXJzZSBlcnJvcjogJHtwYXJzZUVycm9yLm1lc3NhZ2V9LiBCb2R5OiAke2JvZHkuc3Vic3RyaW5nKDAsIDIwMCl9YCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gc2Vzc2lvbklkID8gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBleGlzdGluZy5sYXN0QWN0aXZpdHlBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBleGlzdGluZy50cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcywgcGFyc2VkQm9keSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOZXcgc2Vzc2lvbiBtdXN0IGNvbWUgd2l0aCBhbiBpbml0aWFsaXplIHJlcXVlc3QuXG4gICAgICAgIGlmICghaXNJbml0aWFsaXplUmVxdWVzdChwYXJzZWRCb2R5KSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjAwMCwgJ0JhZCBSZXF1ZXN0OiBObyB2YWxpZCBzZXNzaW9uIElEIHByb3ZpZGVkJykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIFNlcnZlciBmaXJzdCBzbyB0aGUgdHJhbnNwb3J0IGNhbGxiYWNrIGNsb3N1cmUgY2FwdHVyZXNcbiAgICAgICAgLy8gYW4gYWxyZWFkeS1pbml0aWFsaXplZCBiaW5kaW5nIChhdm9pZHMgVERaLXN0eWxlIG9yZGVyaW5nIHN1cnByaXNlcykuXG4gICAgICAgIC8vIFQtVjI1LTM6IHByZS1jcmVhdGUgdGhlIHBlci1zZXNzaW9uIHN1YnNjcmlwdGlvbnMgU2V0IGFuZCBwYXNzIGl0XG4gICAgICAgIC8vIGludG8gYnVpbGRTZGtTZXJ2ZXIgc28gdGhlIFN1YnNjcmliZS9VbnN1YnNjcmliZSBoYW5kbGVycyBhbmQgdGhlXG4gICAgICAgIC8vIFNlc3Npb25FbnRyeSBib3RoIHJlZmVyZW5jZSB0aGUgc2FtZSBTZXQgaW5zdGFuY2UuXG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgICAgY29uc3Qgc2RrU2VydmVyID0gdGhpcy5idWlsZFNka1NlcnZlcihzdWJzY3JpcHRpb25zKTtcbiAgICAgICAgY29uc3QgdHJhbnNwb3J0ID0gbmV3IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0KHtcbiAgICAgICAgICAgIHNlc3Npb25JZEdlbmVyYXRvcjogKCkgPT4gcmFuZG9tVVVJRCgpLFxuICAgICAgICAgICAgZW5hYmxlSnNvblJlc3BvbnNlOiB0cnVlLFxuICAgICAgICAgICAgb25zZXNzaW9uaW5pdGlhbGl6ZWQ6IChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuc2V0KGlkLCB7IHRyYW5zcG9ydCwgc2RrU2VydmVyLCBsYXN0QWN0aXZpdHlBdDogRGF0ZS5ub3coKSwgc3Vic2NyaXB0aW9ucyB9KTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHNlc3Npb24gaW5pdGlhbGl6ZWQ6ICR7aWR9ICh0b3RhbDogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uc2Vzc2lvbmNsb3NlZDogKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc2Vzc2lvbiBjbG9zZWQ6ICR7aWR9IChyZW1haW5pbmc6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBhd2FpdCBzZGtTZXJ2ZXIuY29ubmVjdCh0cmFuc3BvcnQpO1xuICAgICAgICBhd2FpdCB0cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcywgcGFyc2VkQm9keSk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLmNsZWFudXBJbnRlcnZhbCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmNsZWFudXBJbnRlcnZhbCk7XG4gICAgICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVC1WMjUtMzogdGVhciBkb3duIHRoZSBicmlkZ2UgYmVmb3JlIGNsb3Npbmcgc2Vzc2lvbnMgc28gYW55XG4gICAgICAgIC8vIGluLWZsaWdodCBub3RpZmljYXRpb24gdGltZXJzIGFyZSBjbGVhcmVkIGFuZCBubyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdHJ5IHRvIHB1c2ggdG8gY2xvc2VkIHRyYW5zcG9ydHMuXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0QnJpZGdlLnN0b3AoKTtcbiAgICAgICAgZm9yIChjb25zdCB7IHRyYW5zcG9ydCB9IG9mIHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdHJhbnNwb3J0LmNsb3NlKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1BTZXJ2ZXJdIHRyYW5zcG9ydCBjbG9zZSBlcnJvcjonLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlc3Npb25zLmNsZWFyKCk7XG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgIC8vIGNsb3NlKCkgb25seSByZWZ1c2VzIE5FVyBjb25uZWN0aW9uczsga2VlcC1hbGl2ZSBzb2NrZXRzIHN0YXlcbiAgICAgICAgICAgIC8vIG9wZW4gYW5kIHdvdWxkIGJsb2NrIGNsb3NlKCkgZm9yZXZlci4gRm9yY2UgdGhlbSB0byBkcm9wIHRvby5cbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlci5jbG9zZUFsbENvbm5lY3Rpb25zPy4oKTtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEuY2xvc2UoKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyID0gbnVsbDtcbiAgICAgICAgICAgIGxvZ2dlci5pbmZvKCdbTUNQU2VydmVyXSBIVFRQIHNlcnZlciBzdG9wcGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0U3RhdHVzKCk6IFNlcnZlclN0YXR1cyB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBydW5uaW5nOiAhIXRoaXMuaHR0cFNlcnZlcixcbiAgICAgICAgICAgIHBvcnQ6IHRoaXMuc2V0dGluZ3MucG9ydCxcbiAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuc2Vzc2lvbnMuc2l6ZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZVNpbXBsZUFQSVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBwYXRobmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGhuYW1lLnNwbGl0KCcvJykuZmlsdGVyKHAgPT4gcCk7XG4gICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgQVBJIHBhdGguIFVzZSAvYXBpL3tjYXRlZ29yeX0ve3Rvb2xfbmFtZX0nIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsVG9vbE5hbWUgPSBgJHtwYXRoUGFydHNbMV19XyR7cGF0aFBhcnRzWzJdfWA7XG5cbiAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRCb2R5KHJlcSk7XG4gICAgICAgIGxldCBwYXJhbXM6IGFueTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHBhcmFtcyA9IGJvZHkgPyBKU09OLnBhcnNlKGJvZHkpIDoge307XG4gICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgICAgICAgICAgZGV0YWlsczogcGFyc2VFcnJvci5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkQm9keTogYm9keS5zdWJzdHJpbmcoMCwgMjAwKSxcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChmdWxsVG9vbE5hbWUsIHBhcmFtcyk7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIHRvb2w6IGZ1bGxUb29sTmFtZSwgcmVzdWx0IH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSBTaW1wbGUgQVBJIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgICAgIGlmICghcmVzLmhlYWRlcnNTZW50KSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlLCB0b29sOiBwYXRobmFtZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFNpbXBsaWZpZWRUb29sc0xpc3QoKTogYW55W10ge1xuICAgICAgICByZXR1cm4gdGhpcy50b29sc0xpc3QubWFwKHRvb2wgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSB0b29sLm5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgICAgIGNvbnN0IGNhdGVnb3J5ID0gcGFydHNbMF07XG4gICAgICAgICAgICBjb25zdCB0b29sTmFtZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJ18nKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxuICAgICAgICAgICAgICAgIGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIHRvb2xOYW1lLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgIGFwaVBhdGg6IGAvYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9YCxcbiAgICAgICAgICAgICAgICBjdXJsRXhhbXBsZTogdGhpcy5nZW5lcmF0ZUN1cmxFeGFtcGxlKGNhdGVnb3J5LCB0b29sTmFtZSwgdG9vbC5pbnB1dFNjaGVtYSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlQ3VybEV4YW1wbGUoY2F0ZWdvcnk6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgc2NoZW1hOiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBzYW1wbGVQYXJhbXMgPSB0aGlzLmdlbmVyYXRlU2FtcGxlUGFyYW1zKHNjaGVtYSk7XG4gICAgICAgIGNvbnN0IGpzb25TdHJpbmcgPSBKU09OLnN0cmluZ2lmeShzYW1wbGVQYXJhbXMsIG51bGwsIDIpO1xuICAgICAgICByZXR1cm4gYGN1cmwgLVggUE9TVCBodHRwOi8vMTI3LjAuMC4xOiR7dGhpcy5zZXR0aW5ncy5wb3J0fS9hcGkvJHtjYXRlZ29yeX0vJHt0b29sTmFtZX0gXFxcXFxuICAtSCBcIkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvblwiIFxcXFxcbiAgLWQgJyR7anNvblN0cmluZ30nYDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlU2FtcGxlUGFyYW1zKHNjaGVtYTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKCFzY2hlbWEgfHwgIXNjaGVtYS5wcm9wZXJ0aWVzKSByZXR1cm4ge307XG4gICAgICAgIGNvbnN0IHNhbXBsZTogYW55ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoc2NoZW1hLnByb3BlcnRpZXMgYXMgYW55KSkge1xuICAgICAgICAgICAgY29uc3QgcHJvcFNjaGVtYSA9IHByb3AgYXMgYW55O1xuICAgICAgICAgICAgc3dpdGNoIChwcm9wU2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyAnZXhhbXBsZV9zdHJpbmcnO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyA0MjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IHsgeDogMCwgeTogMCwgejogMCB9O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9ICdleGFtcGxlX3ZhbHVlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2FtcGxlO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMudXBkYXRpbmcpIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQU2VydmVyXSB1cGRhdGVTZXR0aW5ncyBpZ25vcmVkIOKAlCBhbm90aGVyIHVwZGF0ZSBpbiBwcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRpbmcgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICAgICAgc2V0RGVidWdMb2dFbmFibGVkKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcbiAgICAgICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBwYW5lbCB0b2dnbGVzIGZvciBlbmFibGVFZGl0b3JDb250ZXh0RXZhbCBtdXN0XG4gICAgICAgICAgICAvLyB0YWtlIGVmZmVjdCBpbW1lZGlhdGVseS4gV2l0aG91dCB0aGlzIHJlLWFwcGx5LCBkaXNhYmxpbmcgdGhlXG4gICAgICAgICAgICAvLyBzZXR0aW5nIGFmdGVyIGVuYWJsZSB3b3VsZCBsZWF2ZSB0aGUgcnVudGltZSBmbGFnIE9OIHVudGlsIHRoZVxuICAgICAgICAgICAgLy8gZW50aXJlIGV4dGVuc2lvbiByZWxvYWRzIOKAlCBhIHNlY3VyaXR5LXJlbGV2YW50IGdhcCBiZWNhdXNlIHRoZVxuICAgICAgICAgICAgLy8gZWRpdG9yLWNvbnRleHQgZXZhbCB3b3VsZCBrZWVwIGFjY2VwdGluZyBBSS1nZW5lcmF0ZWQgaG9zdC1zaWRlXG4gICAgICAgICAgICAvLyBjb2RlIGRlc3BpdGUgdGhlIHVzZXIncyBwYW5lbCBjaG9pY2UuXG4gICAgICAgICAgICBzZXRFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRWRpdG9yQ29udGV4dEV2YWwgPz8gZmFsc2UpO1xuICAgICAgICAgICAgLy8gdjIuNC44IEEzOiByZS1hcHBseSBzY2VuZS1sb2ctY2FwdHVyZSBmbGFnIG9uIGV2ZXJ5IHNldHRpbmdzXG4gICAgICAgICAgICAvLyBjaGFuZ2Ugc28gcGFuZWwgdG9nZ2xlIHRha2VzIGVmZmVjdCBpbW1lZGlhdGVseSwgbWlycm9yaW5nIHRoZVxuICAgICAgICAgICAgLy8gZWRpdG9yQ29udGV4dEV2YWwgcmUtYXBwbHkgcGF0dGVybi5cbiAgICAgICAgICAgIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlU2NlbmVMb2dDYXB0dXJlID8/IHRydWUpO1xuICAgICAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc3RvcCgpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gdjIuNy4wICMyIChXNyBmcm9tIHYyLjYuMCByZXZpZXcpOiByZXNvbHZlIHRoZSBBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cbi8vIGhlYWRlciB2YWx1ZSBmb3IgL2dhbWUvKiBlbmRwb2ludHMuIFJldHVybnM6XG4vLyAgIC0gdGhlIGVjaG8nZCBvcmlnaW4gc3RyaW5nIHdoZW4gdGhlIG9yaWdpbiBpcyBpbiBvdXIgdHJ1c3QgbGlzdFxuLy8gICAtIHRoZSBsaXRlcmFsICdudWxsJyBzdHJpbmcgd2hlbiB0aGUgcmVxdWVzdCBoYXMgT3JpZ2luOiBudWxsIChmaWxlOi8vXG4vLyAgICAgVVJMcyBzZW5kIHRoaXM7IGNvY29zIFBJRSB3ZWJ2aWV3IG9mdGVuIHJ1bnMgZnJvbSBmaWxlOi8vKVxuLy8gICAtIHRoZSB3aWxkY2FyZCAnKicgZm9yIG5vLU9yaWdpbiByZXF1ZXN0cyAoY3VybC9Ob2RlIGNsaWVudHMsIHNhbWUtXG4vLyAgICAgb3JpZ2luIHJlcXVlc3RzIHRoYXQgZG9uJ3Qgc2VuZCBPcmlnaW4pIOKAlCBDT1JTIG9ubHkgbWF0dGVycyBpblxuLy8gICAgIGJyb3dzZXJzLCBhbmQgc2FtZS1vcmlnaW4gLyBuby1PcmlnaW4gcGF0aHMgY2FuJ3QgYmUgY3Jvc3MtdGFiXG4vLyAgICAgYXR0YWNrZXJzXG4vLyAgIC0gbnVsbCAodGhlIEpTIHZhbHVlKSB3aGVuIHRoZSBvcmlnaW4gaXMgZGlzYWxsb3dlZCDihpIgY2FsbGVyIG9taXRzIHRoZVxuLy8gICAgIEFDQU8gaGVhZGVyIHNvIGJyb3dzZXJzIGJsb2NrIHRoZSByZXNwb25zZVxuZnVuY3Rpb24gcmVzb2x2ZUdhbWVDb3JzT3JpZ2luKG9yaWdpbjogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCfn6EgKyBHZW1pbmkg8J+foSk6IG5vZGUgaHR0cCBhbGxvd3MgZHVwbGljYXRlXG4gICAgLy8gT3JpZ2luIGhlYWRlcnMsIHdoaWNoIHByb2R1Y2VzIGEgc3RyaW5nW10gaGVyZS4gV0hBVFdHIFVSTCB3b3VsZFxuICAgIC8vIHNlcmlhbGl6ZSB0aGF0IHRvIFwiYSxiXCIgYW5kIGVpdGhlciB0aHJvdyBvciBtaXMtY2xhc3NpZnkuIFRyZWF0IGFzXG4gICAgLy8gZGlzYWxsb3dlZCDigJQgYSBsZWdpdGltYXRlIGJyb3dzZXIgc2VuZHMgZXhhY3RseSBvbmUgT3JpZ2luLlxuICAgIGlmIChBcnJheS5pc0FycmF5KG9yaWdpbikpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChvcmlnaW4gPT09IHVuZGVmaW5lZCB8fCBvcmlnaW4gPT09ICcnKSB7XG4gICAgICAgIC8vIE5vIE9yaWdpbiBoZWFkZXIg4oaSIG5vdCBhIGJyb3dzZXIgZmV0Y2guIEFsbG93LlxuICAgICAgICByZXR1cm4gJyonO1xuICAgIH1cbiAgICBpZiAob3JpZ2luID09PSAnbnVsbCcpIHtcbiAgICAgICAgLy8gZmlsZTovLyBwYWdlcyBhbmQgc29tZSBzYW5kYm94ZWQgaWZyYW1lcyBzZW5kICdudWxsJy4gQWxsb3c6XG4gICAgICAgIC8vIGNvY29zIFBJRSB3ZWJ2aWV3IG9mdGVuIGZhbGxzIGludG8gdGhpcyBidWNrZXQuXG4gICAgICAgIHJldHVybiAnbnVsbCc7XG4gICAgfVxuICAgIC8vIEFsbG93IGxvb3BiYWNrIEhUVFAgb3JpZ2lucyAoY29jb3MgYnJvd3NlciBwcmV2aWV3IGF0XG4gICAgLy8gaHR0cDovL2xvY2FsaG9zdDo3NDU2IGV0Yy4pIGFuZCBkZXZ0b29scy9maWxlIHNjaGVtZXMuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdSA9IG5ldyBVUkwob3JpZ2luKTtcbiAgICAgICAgaWYgKHUucHJvdG9jb2wgPT09ICdmaWxlOicgfHwgdS5wcm90b2NvbCA9PT0gJ2RldnRvb2xzOicpIHJldHVybiBvcmlnaW47XG4gICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGdlbWluaSDwn5S0KTogV0hBVFdHIFVSTCBrZWVwc1xuICAgICAgICAvLyBicmFja2V0cyBhcm91bmQgSVB2NiBob3N0bmFtZXMgb24gTm9kZSAxOCssIGJ1dCBvbGRlciBidW5kbGVkXG4gICAgICAgIC8vIE5vZGUgYnVpbGRzIG1heSBzdHJpcCB0aGVtIOKAlCBhY2NlcHQgYm90aCB0byBiZSBwb3J0YWJsZSBhY3Jvc3NcbiAgICAgICAgLy8gd2hhdGV2ZXIgTm9kZSB0aGUgY29jb3MgZWRpdG9yIHNoaXBzIGF0IGFueSBnaXZlbiB2ZXJzaW9uLlxuICAgICAgICBpZiAoKHUucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdS5wcm90b2NvbCA9PT0gJ2h0dHBzOicpXG4gICAgICAgICAgICAmJiAodS5ob3N0bmFtZSA9PT0gJ2xvY2FsaG9zdCcgfHwgdS5ob3N0bmFtZSA9PT0gJzEyNy4wLjAuMSdcbiAgICAgICAgICAgICAgICB8fCB1Lmhvc3RuYW1lID09PSAnWzo6MV0nIHx8IHUuaG9zdG5hbWUgPT09ICc6OjEnKSkge1xuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbjtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBNYWxmb3JtZWQgT3JpZ2luIGhlYWRlciDihpIgcmVqZWN0LlxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBjYXAgcmVxdWVzdCBib2RpZXMgYXQgMzIgTUIuXG4vLyBTY3JlZW5zaG90cyBjb21lIGJhY2sgYXMgZGF0YSBVUkxzIHRoYXQgY2FuIGxlZ2l0aW1hdGVseSBiZSBhIGZldyBNQiBvblxuLy8gNGsgY2FudmFzZXMsIHNvIHdlIHNldCB0aGUgY2FwIGdlbmVyb3VzbHkgcmF0aGVyIHRoYW4gcGVyLWVuZHBvaW50LlxuLy8gQWJvdmUgdGhlIGNhcCB3ZSBkZXN0cm95IHRoZSBjb25uZWN0aW9uIHNvIHRoZSBjbGllbnQgc2VlcyBhIGhhcmQgY2xvc2Vcbi8vIHJhdGhlciB0aGFuIGEgc2xvdyB0cnV0aGZ1bCA0MTMgKGF2b2lkcyB0aGVtIGNvbnRpbnVpbmcgdG8gc3RyZWFtKS5cbi8vIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+foSArIENvZGV4IPCfn6EpOiBidW1wZWQgMzIg4oaSIDY0IE1CIHNvXG4vLyBNZWRpYVJlY29yZGVyIG91dHB1dCBhdCBoaWdoIGJpdHJhdGVzICg1LTIwIE1icHMgw5cgMzAtNjBzID0gMTgtMTUwIE1CKVxuLy8gaGFzIG1vcmUgaGVhZHJvb20gYmVmb3JlIHRoZSB0cmFuc3BvcnQgbGF5ZXIgNDEzcy4gVGhlIGhvc3Qtc2lkZVxuLy8gTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTIGluIGRlYnVnLXRvb2xzLnRzIGlzIGhlbGQgaWRlbnRpY2FsIHNvIGJvdGhcbi8vIGNhcHMgbW92ZSB0b2dldGhlcjsgbG93ZXIgb25lIHRvIGRpYWwgYmFjayBpZiBtZW1vcnkgcHJlc3N1cmUgYmVjb21lc1xuLy8gYSBjb25jZXJuLlxuY29uc3QgTUFYX1JFUVVFU1RfQk9EWV9CWVRFUyA9IDY0ICogMTAyNCAqIDEwMjQ7XG5cbmNsYXNzIEJvZHlUb29MYXJnZUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIHJlYWRvbmx5IHN0YXR1c0NvZGUgPSA0MTM7XG4gICAgY29uc3RydWN0b3IoKSB7IHN1cGVyKGBSZXF1ZXN0IGJvZHkgZXhjZWVkcyAke01BWF9SRVFVRVNUX0JPRFlfQllURVN9IGJ5dGVzYCk7IH1cbn1cblxuZnVuY3Rpb24gcmVhZEJvZHkocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuICAgICAgICBsZXQgdG90YWwgPSAwO1xuICAgICAgICByZXEub24oJ2RhdGEnLCAoY2h1bms6IEJ1ZmZlcikgPT4ge1xuICAgICAgICAgICAgdG90YWwgKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKHRvdGFsID4gTUFYX1JFUVVFU1RfQk9EWV9CWVRFUykge1xuICAgICAgICAgICAgICAgIHJlcS5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBCb2R5VG9vTGFyZ2VFcnJvcigpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaHVua3MucHVzaChjaHVuayk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXEub24oJ2VuZCcsICgpID0+IHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICAgICAgcmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgfSk7XG59XG4iXX0=