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
// v2.9.6 round-2 fix (Codex 🔴): SDK constant tracks behavior compat
// (minor base), per the project policy established in v2.8.1. v2.8.x →
// v2.9.x crossed a minor bump but SERVER_VERSION stayed at '2.8.0',
// so MCP `initialize` clients on v2.9.x see a stale 2.8 handshake.
// Bump to '2.9.0' — the minor base for the 2.9.x line. Patch tags
// (2.9.x) live in package.json.version, not here.
const SERVER_VERSION = '2.9.0';
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
                annotations: t.annotations,
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
                    annotations: tool.annotations,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQixtQ0FBb0M7QUFDcEMsd0VBQW1FO0FBQ25FLDBGQUFtRztBQUNuRyxpRUFXNEM7QUFFNUMsbUNBQXVEO0FBQ3ZELHVEQUE2RjtBQUU3RixtREFBZ0Y7QUFDaEYsNkRBQXlEO0FBQ3pELGlEQUEwRTtBQUMxRSxpRUFJa0M7QUFFbEMsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDdkMsK0VBQStFO0FBQy9FLDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0UsMkRBQTJEO0FBQzNELHFFQUFxRTtBQUNyRSx1RUFBdUU7QUFDdkUsb0VBQW9FO0FBQ3BFLG1FQUFtRTtBQUNuRSxrRUFBa0U7QUFDbEUsa0RBQWtEO0FBQ2xELE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQztBQUUvQiwrRUFBK0U7QUFDL0UsNkVBQTZFO0FBQzdFLE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDL0MsTUFBTSwyQkFBMkIsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBWTlDLFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxPQUFlO0lBQy9DLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsU0FBUztJQWdCbEIsWUFBWSxRQUEyQixFQUFFLFFBQXNCOztRQWR2RCxlQUFVLEdBQXVCLElBQUksQ0FBQztRQUN0QyxhQUFR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QU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkIsQ0FBQyxDQUFDLENBQUM7UUFDSCxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzVCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgU2VydmVyIH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvaW5kZXguanMnO1xuaW1wb3J0IHsgU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9zdHJlYW1hYmxlSHR0cC5qcyc7XG5pbXBvcnQge1xuICAgIENhbGxUb29sUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0VG9vbHNSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RSZXNvdXJjZXNSZXF1ZXN0U2NoZW1hLFxuICAgIExpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RTY2hlbWEsXG4gICAgUmVhZFJlc291cmNlUmVxdWVzdFNjaGVtYSxcbiAgICBTdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLFxuICAgIFVuc3Vic2NyaWJlUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UHJvbXB0c1JlcXVlc3RTY2hlbWEsXG4gICAgR2V0UHJvbXB0UmVxdWVzdFNjaGVtYSxcbiAgICBpc0luaXRpYWxpemVSZXF1ZXN0LFxufSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJztcbmltcG9ydCB7IE1DUFNlcnZlclNldHRpbmdzLCBTZXJ2ZXJTdGF0dXMsIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBzZXREZWJ1Z0xvZ0VuYWJsZWQsIGxvZ2dlciB9IGZyb20gJy4vbGliL2xvZyc7XG5pbXBvcnQgeyBzZXRFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQsIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQgfSBmcm9tICcuL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IFRvb2xSZWdpc3RyeSB9IGZyb20gJy4vdG9vbHMvcmVnaXN0cnknO1xuaW1wb3J0IHsgUmVzb3VyY2VSZWdpc3RyeSwgY3JlYXRlUmVzb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4vcmVzb3VyY2VzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IEJyb2FkY2FzdEJyaWRnZSB9IGZyb20gJy4vbGliL2Jyb2FkY2FzdC1icmlkZ2UnO1xuaW1wb3J0IHsgUHJvbXB0UmVnaXN0cnksIGNyZWF0ZVByb21wdFJlZ2lzdHJ5IH0gZnJvbSAnLi9wcm9tcHRzL3JlZ2lzdHJ5JztcbmltcG9ydCB7XG4gICAgY29uc3VtZVBlbmRpbmdDb21tYW5kLFxuICAgIHNldENvbW1hbmRSZXN1bHQsXG4gICAgZ2V0Q2xpZW50U3RhdHVzLFxufSBmcm9tICcuL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuXG5jb25zdCBTRVJWRVJfTkFNRSA9ICdjb2Nvcy1tY3Atc2VydmVyJztcbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGdlbWluaSDwn5S0KToga2VlcCB0aGlzIGluIHN5bmMgd2l0aCBwYWNrYWdlLmpzb24nc1xuLy8gdmVyc2lvbiBvbiBldmVyeSBtaW5vci9tYWpvciBidW1wLiBTREsgU2VydmVyIGluaXRpYWxpemUgcmVzcG9uc2UgY2Fycmllc1xuLy8gdGhpcyBzdHJpbmc7IGNsaWVudHMgc2VlIGl0IGR1cmluZyBNQ1AgaGFuZHNoYWtlLiBEcmlmdCBzaW5jZSB2Mi4wLjAgaGFzXG4vLyBiZWVuIGNvbmZ1c2luZyByZXZpZXcgcm91bmRzIGFuZCBsaXZlLXRlc3QgdmVyaWZpY2F0aW9uLlxuLy8gdjIuOS42IHJvdW5kLTIgZml4IChDb2RleCDwn5S0KTogU0RLIGNvbnN0YW50IHRyYWNrcyBiZWhhdmlvciBjb21wYXRcbi8vIChtaW5vciBiYXNlKSwgcGVyIHRoZSBwcm9qZWN0IHBvbGljeSBlc3RhYmxpc2hlZCBpbiB2Mi44LjEuIHYyLjgueCDihpJcbi8vIHYyLjkueCBjcm9zc2VkIGEgbWlub3IgYnVtcCBidXQgU0VSVkVSX1ZFUlNJT04gc3RheWVkIGF0ICcyLjguMCcsXG4vLyBzbyBNQ1AgYGluaXRpYWxpemVgIGNsaWVudHMgb24gdjIuOS54IHNlZSBhIHN0YWxlIDIuOCBoYW5kc2hha2UuXG4vLyBCdW1wIHRvICcyLjkuMCcg4oCUIHRoZSBtaW5vciBiYXNlIGZvciB0aGUgMi45LnggbGluZS4gUGF0Y2ggdGFnc1xuLy8gKDIuOS54KSBsaXZlIGluIHBhY2thZ2UuanNvbi52ZXJzaW9uLCBub3QgaGVyZS5cbmNvbnN0IFNFUlZFUl9WRVJTSU9OID0gJzIuOS4wJztcblxuLy8gSWRsZSBzZXNzaW9uIHN3ZWVwOiBkcm9wIHNlc3Npb25zIHRoYXQgaGF2ZW4ndCBiZWVuIHRvdWNoZWQgaW4gdGhpcyBtYW55IG1zLlxuLy8gU2V0IGNvbnNlcnZhdGl2ZWx5IGxvbmcgZm9yIGVkaXRvciB1c2FnZSB3aGVyZSBhIGRldmVsb3BlciBtYXkgcGF1c2Ugd29yay5cbmNvbnN0IFNFU1NJT05fSURMRV9USU1FT1VUX01TID0gMzAgKiA2MCAqIDEwMDA7XG5jb25zdCBTRVNTSU9OX0NMRUFOVVBfSU5URVJWQUxfTVMgPSA2MCAqIDEwMDA7XG5cbmludGVyZmFjZSBTZXNzaW9uRW50cnkge1xuICAgIHRyYW5zcG9ydDogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQ7XG4gICAgc2RrU2VydmVyOiBTZXJ2ZXI7XG4gICAgbGFzdEFjdGl2aXR5QXQ6IG51bWJlcjtcbiAgICAvLyBULVYyNS0zOiBwZXItc2Vzc2lvbiByZXNvdXJjZSBVUkkgc3Vic2NyaXB0aW9ucyBmb3JcbiAgICAvLyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHB1c2guIEVtcHR5IHNldCDihpIgc2Vzc2lvblxuICAgIC8vIGdldHMgbm8gbm90aWZpY2F0aW9ucyBldmVuIGlmIHRoZSBicmlkZ2UgZmlyZXMuXG4gICAgc3Vic2NyaXB0aW9uczogU2V0PHN0cmluZz47XG59XG5cbmZ1bmN0aW9uIGpzb25ScGNFcnJvcihjb2RlOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogJzIuMCcsIGVycm9yOiB7IGNvZGUsIG1lc3NhZ2UgfSwgaWQ6IG51bGwgfSk7XG59XG5cbi8qKlxuICogTUNQIHNlcnZlciBiYWNrZWQgYnkgdGhlIG9mZmljaWFsIEBtb2RlbGNvbnRleHRwcm90b2NvbC9zZGsgU2VydmVyICtcbiAqIFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IChzdGF0ZWZ1bCBtb2RlKS5cbiAqXG4gKiBFYWNoIE1DUCBjbGllbnQgZ2V0cyBpdHMgb3duIFNlcnZlciArIFRyYW5zcG9ydCBwYWlyIGtleWVkIGJ5XG4gKiBgbWNwLXNlc3Npb24taWRgLiBJbml0aWFsaXplIHJlcXVlc3RzIHdpdGggbm8gc2Vzc2lvbiBpZCBtaW50IGEgbmV3IHBhaXIuXG4gKiBSRVNUIGVuZHBvaW50cyAoL2hlYWx0aCwgL2FwaS90b29scywgL2FwaS97Y2F0fS97dG9vbH0pIHNoYXJlIHRoZSBzYW1lXG4gKiB1bmRlcmx5aW5nIGh0dHAuU2VydmVyLlxuICovXG5leHBvcnQgY2xhc3MgTUNQU2VydmVyIHtcbiAgICBwcml2YXRlIHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncztcbiAgICBwcml2YXRlIGh0dHBTZXJ2ZXI6IGh0dHAuU2VydmVyIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBzZXNzaW9uczogTWFwPHN0cmluZywgU2Vzc2lvbkVudHJ5PiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIHRvb2xzOiBUb29sUmVnaXN0cnk7XG4gICAgcHJpdmF0ZSByZXNvdXJjZXM6IFJlc291cmNlUmVnaXN0cnk7XG4gICAgcHJpdmF0ZSBwcm9tcHRzOiBQcm9tcHRSZWdpc3RyeTtcbiAgICBwcml2YXRlIHRvb2xzTGlzdDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgIHByaXZhdGUgZW5hYmxlZFRvb2xzOiBhbnlbXSA9IFtdO1xuICAgIHByaXZhdGUgY2xlYW51cEludGVydmFsOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgdXBkYXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAvLyBULVYyNS0zOiBicmlkZ2UgY29jb3MgZWRpdG9yIElQQyBicm9hZGNhc3RzIOKGkiBNQ1BcbiAgICAvLyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkLiBzdGFydCgpL3N0b3AoKSBsaWZlY3ljbGVcbiAgICAvLyB0aWVkIHRvIHRoZSBIVFRQIHNlcnZlci5cbiAgICBwcml2YXRlIGJyb2FkY2FzdEJyaWRnZTogQnJvYWRjYXN0QnJpZGdlID0gbmV3IEJyb2FkY2FzdEJyaWRnZSgpO1xuXG4gICAgY29uc3RydWN0b3Ioc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzLCByZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KSB7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy50b29scyA9IHJlZ2lzdHJ5O1xuICAgICAgICB0aGlzLnJlc291cmNlcyA9IGNyZWF0ZVJlc291cmNlUmVnaXN0cnkocmVnaXN0cnkpO1xuICAgICAgICAvLyBULVYyNS00OiBwcm9tcHRzIHJlZ2lzdHJ5IGJha2VkIHdpdGggcHJvamVjdCBjb250ZXh0IHRoYXQnc1xuICAgICAgICAvLyByZXNvbHZlZCBsYXppbHkg4oCUIEVkaXRvci5Qcm9qZWN0IG1heSBub3QgYmUgcmVhZHkgYXQgTUNQU2VydmVyXG4gICAgICAgIC8vIGNvbnN0cnVjdGlvbiB0aW1lIGJ1dCBpcyByZWxpYWJseSBhdmFpbGFibGUgd2hlbiBwcm9tcHRzL2dldFxuICAgICAgICAvLyBpcyBjYWxsZWQuXG4gICAgICAgIHRoaXMucHJvbXB0cyA9IGNyZWF0ZVByb21wdFJlZ2lzdHJ5KCgpID0+ICh7XG4gICAgICAgICAgICBwcm9qZWN0TmFtZTogdGhpcy5yZXNvbHZlUHJvamVjdE5hbWUoKSxcbiAgICAgICAgICAgIHByb2plY3RQYXRoOiB0aGlzLnJlc29sdmVQcm9qZWN0UGF0aCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgIHNldEVkaXRvckNvbnRleHRFdmFsRW5hYmxlZChzZXR0aW5ncy5lbmFibGVFZGl0b3JDb250ZXh0RXZhbCA/PyBmYWxzZSk7XG4gICAgICAgIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlU2NlbmVMb2dDYXB0dXJlID8/IHRydWUpO1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFVzaW5nIHNoYXJlZCB0b29sIHJlZ2lzdHJ5ICgke09iamVjdC5rZXlzKHJlZ2lzdHJ5KS5sZW5ndGh9IGNhdGVnb3JpZXMpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFNka1NlcnZlcihzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPik6IFNlcnZlciB7XG4gICAgICAgIGNvbnN0IHNka1NlcnZlciA9IG5ldyBTZXJ2ZXIoXG4gICAgICAgICAgICB7IG5hbWU6IFNFUlZFUl9OQU1FLCB2ZXJzaW9uOiBTRVJWRVJfVkVSU0lPTiB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgICAgICAgICAgICB0b29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBULVYyNS0zIChULVAzLTMpOiBzdWJzY3JpYmUgaXMgbm93IHRydWUg4oCUIGNsaWVudHMgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc291cmNlcy9zdWJzY3JpYmUgdG8gYSBVUkk7IHRoZSBicm9hZGNhc3QtYnJpZGdlXG4gICAgICAgICAgICAgICAgICAgIC8vIHB1c2hlcyBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIG1hcHBlZCBjb2NvcyBicm9hZGNhc3QgZmlyZXMgKGRlYm91bmNlZCBwZXIgVVJJKS5cbiAgICAgICAgICAgICAgICAgICAgLy8gUkZDIDY1NzAgdGVtcGxhdGVzIGFyZSBpbXBsaWNpdGx5IHN1cHBvcnRlZCBieSByZWdpc3RlcmluZ1xuICAgICAgICAgICAgICAgICAgICAvLyBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hIGJlbG93IOKAlCBNQ1Agc3BlYyBoYXMgbm9cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb3VyY2VzLnRlbXBsYXRlcyBjYXBhYmlsaXR5IGZsYWcgKGNvY29zLWNsaSdzXG4gICAgICAgICAgICAgICAgICAgIC8vIGB0ZW1wbGF0ZXM6IHRydWVgIGlzIG5vbi1zcGVjIGFuZCB3b3VsZCBiZSBzdHJpcHBlZCkuXG4gICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSwgc3Vic2NyaWJlOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFQtVjI1LTQgKFQtUDMtMik6IDQgYmFrZWQgcHJvbXB0IHRlbXBsYXRlczsgbm9cbiAgICAgICAgICAgICAgICAgICAgLy8gaG90LXJlbG9hZCB5ZXQgc28gbGlzdENoYW5nZWQgc3RheXMgZmFsc2UuXG4gICAgICAgICAgICAgICAgICAgIHByb21wdHM6IHsgbGlzdENoYW5nZWQ6IGZhbHNlIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICB0b29sczogdGhpcy50b29sc0xpc3QubWFwKHQgPT4gKHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHQuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgYW5ub3RhdGlvbnM6IHQuYW5ub3RhdGlvbnMsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHQuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICB9KSksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgbmFtZSwgYXJndW1lbnRzOiBhcmdzIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwobmFtZSwgYXJncyA/PyB7fSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRUb29sUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH1dLFxuICAgICAgICAgICAgICAgICAgICBpc0Vycm9yOiB0cnVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICByZXNvdXJjZXM6IHRoaXMucmVzb3VyY2VzLmxpc3QoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHJlc291cmNlVGVtcGxhdGVzOiB0aGlzLnJlc291cmNlcy5saXN0VGVtcGxhdGVzKCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvdXJjZXMucmVhZCh1cmkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgY29udGVudHM6IFtjb250ZW50XSB9O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVC1WMjUtMzogcGVyLXNlc3Npb24gcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIGhhbmRsZXJzLiBUaGVcbiAgICAgICAgLy8gYHN1YnNjcmlwdGlvbnNgIFNldCBpcyBjYXB0dXJlZCBhdCBzZXNzaW9uLWNyZWF0aW9uIHRpbWUgYW5kXG4gICAgICAgIC8vIHNoYXJlZCB3aXRoIHRoZSBTZXNzaW9uRW50cnkgc28gYG5vdGlmeVJlc291cmNlVXBkYXRlZGBcbiAgICAgICAgLy8gY2FuIGl0ZXJhdGUgc2Vzc2lvbnMgYW5kIGNoZWNrIG1lbWJlcnNoaXAgd2l0aG91dCBhIHNlY29uZFxuICAgICAgICAvLyBsb29rdXAuXG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihTdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5hZGQodXJpKTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFVuc3Vic2NyaWJlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbnMuZGVsZXRlKHVyaSk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHVuc3Vic2NyaWJlICR7dXJpfSAoc2Vzc2lvbiBhY3RpdmUgc3ViczogJHtzdWJzY3JpcHRpb25zLnNpemV9KWApO1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVC1WMjUtNDogcHJvbXB0cy9saXN0ICsgcHJvbXB0cy9nZXQuIFN0YXRlbGVzcyAobm8gc2Vzc2lvblxuICAgICAgICAvLyBhZmZpbml0eSBuZWVkZWQpOyByZW5kZXJlZCB0ZXh0IGJha2VzIGluIHByb2plY3QgY29udGV4dCBhdFxuICAgICAgICAvLyBjYWxsIHRpbWUgc28gYSBwcm9qZWN0IHJlbmFtZSBpcyByZWZsZWN0ZWQgaW1tZWRpYXRlbHkuXG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UHJvbXB0c1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgICBwcm9tcHRzOiB0aGlzLnByb21wdHMubGlzdCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihHZXRQcm9tcHRSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBuYW1lIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLnByb21wdHMuZ2V0KG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFjb250ZW50KSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hKTogdW5rbm93blxuICAgICAgICAgICAgICAgIC8vIHByb21wdCBuYW1lcyBtdXN0IHN1cmZhY2UgYXMgSlNPTi1SUEMgZXJyb3JzIHBlciBNQ1Agc3BlYyxcbiAgICAgICAgICAgICAgICAvLyBub3QgYXMgc3VjY2Vzc2Z1bCBcIlByb21wdCBub3QgZm91bmRcIiBjb250ZW50IGJvZGllcy5cbiAgICAgICAgICAgICAgICAvLyBTREsncyBSZXF1ZXN0SGFuZGxlciBjb252ZXJ0cyB0aHJvd24gRXJyb3JzIGludG9cbiAgICAgICAgICAgICAgICAvLyAtMzI2MDMgSW50ZXJuYWwgRXJyb3IgYnkgZGVmYXVsdDsgd2UgdGhyb3cgYSBwbGFpbiBFcnJvclxuICAgICAgICAgICAgICAgIC8vIHdpdGggYSBoZWxwZnVsIG1lc3NhZ2UgaW5jbHVkaW5nIHRoZSBhdmFpbGFibGUgbmFtZXMuXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHByb21wdDogJHtuYW1lfS4gQXZhaWxhYmxlOiAke3RoaXMucHJvbXB0cy5rbm93bk5hbWVzKCkuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFNESydzIEdldFByb21wdFJlc3VsdCB0eXBlIGNhcnJpZXMgYSBkaXNjcmltaW5hdGVkIHVuaW9uXG4gICAgICAgICAgICAvLyAob25lIGJyYW5jaCByZXF1aXJlcyBhIGB0YXNrYCBmaWVsZCkuIE91ciBjb250ZW50IG1hdGNoZXNcbiAgICAgICAgICAgIC8vIHRoZSBzaW1wbGUtcHJvbXB0IGJyYW5jaDsgY2FzdCB0aHJvdWdoIHVua25vd24gdG8gc2F0aXNmeVxuICAgICAgICAgICAgLy8gdGhlIHN0cnVjdHVyYWwgY2hlY2sgd2l0aG91dCBidXlpbmcgaW50byB0aGUgdGFzayBicmFuY2guXG4gICAgICAgICAgICByZXR1cm4gY29udGVudCBhcyB1bmtub3duIGFzIGFueTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzZGtTZXJ2ZXI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdE5hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdGggPSAoRWRpdG9yIGFzIGFueSk/LlByb2plY3Q/LnBhdGggYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAvLyBMYXN0IHBhdGggc2VnbWVudCB1c3VhbGx5IHRoZSBwcm9qZWN0IGZvbGRlciBuYW1lOyBmYWxsIGJhY2tcbiAgICAgICAgICAgICAgICAvLyB0byBcIih1bmtub3duKVwiIGlmIEVkaXRvciBpc24ndCByZWFkeS5cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoL1tcXFxcL10vKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdID8/ICcodW5rbm93biknO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG4gICAgICAgIHJldHVybiAnKHVua25vd24pJztcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0UGF0aCgpOiBzdHJpbmcge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIChFZGl0b3IgYXMgYW55KT8uUHJvamVjdD8ucGF0aCA/PyAnKHVua25vd24pJztcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiAnKHVua25vd24pJzsgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFQtVjI1LTM6IGRpc3BhdGNoIGEgbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCB0byBldmVyeVxuICAgICAqIHNlc3Npb24gdGhhdCBwcmV2aW91c2x5IGNhbGxlZCByZXNvdXJjZXMvc3Vic2NyaWJlIG9uIHRoaXMgVVJJLlxuICAgICAqIENhbGxlZCBieSBCcm9hZGNhc3RCcmlkZ2UgYWZ0ZXIgaXRzIHBlci1VUkkgZGVib3VuY2UgZmlyZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBub3RpZnlSZXNvdXJjZVVwZGF0ZWQodXJpOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCk6IHNka1NlcnZlci5ub3RpZmljYXRpb24oLi4uKVxuICAgICAgICAvLyByZXR1cm5zIGEgUHJvbWlzZS4gV2l0aG91dCBhd2FpdC9jYXRjaCwgdHJhbnNwb3J0LWxldmVsIGZhaWx1cmVzXG4gICAgICAgIC8vIGJlY29tZSB1bmhhbmRsZWQgcmVqZWN0aW9ucyAoTm9kZSBwcmludHMgc2NhcnkgXCJVbmhhbmRsZWRQcm9taXNlUmVqZWN0aW9uXCJcbiAgICAgICAgLy8gYW5kIG1heSBleGl0IG9uIC0tdW5oYW5kbGVkLXJlamVjdGlvbnM9c3RyaWN0KS4gVXNlIHZvaWQrY2F0Y2ggc29cbiAgICAgICAgLy8gdGhlIGxvb3AgY29udGludWVzIGV2ZW4gaWYgb25lIHNlc3Npb24ncyB0cmFuc3BvcnQgaXMgaGFsZi1jbG9zZWQuXG4gICAgICAgIC8vIFNuYXBzaG90IHNlc3Npb24gbGlzdCAoY2xhdWRlIPCfn6EpIHNvIGEgc2Vzc2lvbiByZW1vdmVkIG1pZC1pdGVyYXRpb25cbiAgICAgICAgLy8gZG9lc24ndCBza2V3IHRoZSBxdWV1ZWQgbm90aWZpY2F0aW9ucy5cbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IEFycmF5LmZyb20odGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkuZmlsdGVyKHMgPT4gcy5zdWJzY3JpcHRpb25zLmhhcyh1cmkpKTtcbiAgICAgICAgaWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICB2b2lkIHNlc3Npb24uc2RrU2VydmVyLm5vdGlmaWNhdGlvbih7XG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCcsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7IHVyaSB9LFxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oYFtNQ1BTZXJ2ZXJdIG5vdGlmaWNhdGlvbiBwdXNoIGZhaWxlZCBmb3IgJHt1cml9OmAsIGVycj8ubWVzc2FnZSA/PyBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSByZXNvdXJjZXMvdXBkYXRlZCAke3VyaX0g4oaSICR7dGFyZ2V0cy5sZW5ndGh9IHNlc3Npb24ocylgKTtcbiAgICB9XG5cbiAgICAvLyBULVAxLTU6IFRvb2xSZXNwb25zZSDihpIgTUNQIENhbGxUb29sUmVzdWx0LiBGYWlsdXJlcyBjYXJyeSB0aGUgZXJyb3JcbiAgICAvLyBtZXNzYWdlIGluIHRleHQgY29udGVudCArIGlzRXJyb3IuIFN1Y2Nlc3NlcyBrZWVwIEpTT04uc3RyaW5naWZ5KHJlc3VsdClcbiAgICAvLyBpbiB0ZXh0IChiYWNrLWNvbXBhdCkgYW5kIHRoZSBwYXJzZWQgb2JqZWN0IGluIHN0cnVjdHVyZWRDb250ZW50LlxuICAgIHByaXZhdGUgYnVpbGRUb29sUmVzdWx0KHJlc3VsdDogYW55KSB7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBjb25zdCBtc2cgPSByZXN1bHQuZXJyb3IgPz8gcmVzdWx0Lm1lc3NhZ2UgPz8gJ1Rvb2wgZmFpbGVkJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IEpTT04uc3RyaW5naWZ5KG1zZykgfV0sXG4gICAgICAgICAgICAgICAgaXNFcnJvcjogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGV4dCA9IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogSlNPTi5zdHJpbmdpZnkocmVzdWx0KTtcbiAgICAgICAgY29uc3Qgb3V0OiB7IGNvbnRlbnQ6IEFycmF5PHsgdHlwZTogJ3RleHQnOyB0ZXh0OiBzdHJpbmcgfT47IHN0cnVjdHVyZWRDb250ZW50PzogYW55IH0gPSB7XG4gICAgICAgICAgICBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQgfV0sXG4gICAgICAgIH07XG4gICAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIG91dC5zdHJ1Y3R1cmVkQ29udGVudCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKCdbTUNQU2VydmVyXSBTZXJ2ZXIgaXMgYWxyZWFkeSBydW5uaW5nJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcblxuICAgICAgICBjb25zdCB7IHBvcnQgfSA9IHRoaXMuc2V0dGluZ3M7XG4gICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBTdGFydGluZyBIVFRQIHNlcnZlciBvbiBwb3J0ICR7cG9ydH0uLi5gKTtcbiAgICAgICAgdGhpcy5odHRwU2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIodGhpcy5oYW5kbGVIdHRwUmVxdWVzdC5iaW5kKHRoaXMpKTtcblxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLmxpc3Rlbihwb3J0LCAnMTI3LjAuMC4xJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSDinIUgSFRUUCBzZXJ2ZXIgc3RhcnRlZCBvbiBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH1gKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gSGVhbHRoIGNoZWNrOiBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vaGVhbHRoYCk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIE1DUCBlbmRwb2ludDogIGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9tY3BgKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEub24oJ2Vycm9yJywgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSDinYwgRmFpbGVkIHRvIHN0YXJ0IHNlcnZlcjonLCBlcnIpO1xuICAgICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgW01DUFNlcnZlcl0gUG9ydCAke3BvcnR9IGlzIGFscmVhZHkgaW4gdXNlLiBQbGVhc2UgY2hhbmdlIHRoZSBwb3J0IGluIHNldHRpbmdzLmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBzZXRJbnRlcnZhbCBrZWVwcyB0aGUgTm9kZSBldmVudCBsb29wIGFsaXZlOyB1bnJlZiBzbyB3ZSBkb24ndFxuICAgICAgICAvLyBibG9jayBleHRlbnNpb24gdGVhcmRvd24gaWYgc3RvcCgpIHNvbWVob3cgZG9lc24ndCBydW4uXG4gICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5zd2VlcElkbGVTZXNzaW9ucygpLCBTRVNTSU9OX0NMRUFOVVBfSU5URVJWQUxfTVMpO1xuICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbC51bnJlZj8uKCk7XG5cbiAgICAgICAgLy8gVC1WMjUtMzogc3BpbiB1cCB0aGUgY29jb3MgYnJvYWRjYXN0IOKGkiBNQ1Agbm90aWZpY2F0aW9ucyBicmlkZ2UuXG4gICAgICAgIC8vIERpc2FibGVkIG91dHNpZGUgdGhlIGVkaXRvciBob3N0IChlLmcuIGhlYWRsZXNzIHNtb2tlIHJ1bnMpXG4gICAgICAgIC8vIGJlY2F1c2UgRWRpdG9yLk1lc3NhZ2UuX19wcm90ZWN0ZWRfXyBpc24ndCBhdmFpbGFibGUgdGhlcmU7XG4gICAgICAgIC8vIEJyb2FkY2FzdEJyaWRnZS5zdGFydCgpIGRldGVjdHMgdGhpcyBhbmQgbG9ncyBhIHdhcm5pbmcuXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0QnJpZGdlLnN0YXJ0KCh1cmkpID0+IHRoaXMubm90aWZ5UmVzb3VyY2VVcGRhdGVkKHVyaSkpO1xuXG4gICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSDwn5qAIE1DUCBTZXJ2ZXIgcmVhZHkgKCR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scylgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN3ZWVwSWRsZVNlc3Npb25zKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9ucy5zaXplID09PSAwKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGN1dG9mZiA9IERhdGUubm93KCkgLSBTRVNTSU9OX0lETEVfVElNRU9VVF9NUztcbiAgICAgICAgY29uc3Qgc3RhbGU6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy5zZXNzaW9ucykge1xuICAgICAgICAgICAgaWYgKGVudHJ5Lmxhc3RBY3Rpdml0eUF0IDwgY3V0b2ZmKSBzdGFsZS5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIHN0YWxlKSB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMuc2Vzc2lvbnMuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmICghZW50cnkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgZW50cnkudHJhbnNwb3J0LmNsb3NlKCkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gc3dlZXAgY2xvc2UgZXJyb3IgZm9yICR7aWR9OmAsIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc3dlcHQgaWRsZSBzZXNzaW9uOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwVG9vbHMoKTogdm9pZCB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBuZXcgbGlzdCBsb2NhbGx5IGFuZCBvbmx5IHN3YXAgb25jZSBpdCdzIHJlYWR5LCBzbyB0aGF0XG4gICAgICAgIC8vIGEgY29uY3VycmVudCBMaXN0VG9vbHNSZXF1ZXN0IGNhbiBuZXZlciBvYnNlcnZlIGFuIGVtcHR5IGxpc3QuXG4gICAgICAgIGNvbnN0IGVuYWJsZWRGaWx0ZXIgPSB0aGlzLmVuYWJsZWRUb29scy5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IG5ldyBTZXQodGhpcy5lbmFibGVkVG9vbHMubWFwKHQgPT4gYCR7dC5jYXRlZ29yeX1fJHt0Lm5hbWV9YCkpXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgY29uc3QgbmV4dDogVG9vbERlZmluaXRpb25bXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IFtjYXRlZ29yeSwgdG9vbFNldF0gb2YgT2JqZWN0LmVudHJpZXModGhpcy50b29scykpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmcU5hbWUgPSBgJHtjYXRlZ29yeX1fJHt0b29sLm5hbWV9YDtcbiAgICAgICAgICAgICAgICBpZiAoZW5hYmxlZEZpbHRlciAmJiAhZW5hYmxlZEZpbHRlci5oYXMoZnFOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgLy8gVC1WMjMtMTogdGFnIGV2ZXJ5IG5vbi1wcmltYXJ5IHRvb2wgW3NwZWNpYWxpc3RdIHNvIEFJIHByZWZlcnNcbiAgICAgICAgICAgICAgICAvLyBleGVjdXRlX2phdmFzY3JpcHQgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMuIFRoZSB0d28gZXhlY3V0ZV8qXG4gICAgICAgICAgICAgICAgLy8gdG9vbHMgYWxyZWFkeSBjYXJyeSB0aGVpciBvd24gW3ByaW1hcnldL1tjb21wYXRdIHByZWZpeCBpblxuICAgICAgICAgICAgICAgIC8vIHRoZWlyIGRlc2NyaXB0aW9uIHRleHQg4oCUIGxlYXZlIHRob3NlIGFsb25lLlxuICAgICAgICAgICAgICAgIGNvbnN0IGRlc2MgPSB0b29sLmRlc2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFscmVhZHlUYWdnZWQgPSBkZXNjLnN0YXJ0c1dpdGgoJ1twcmltYXJ5XScpIHx8IGRlc2Muc3RhcnRzV2l0aCgnW2NvbXBhdF0nKSB8fCBkZXNjLnN0YXJ0c1dpdGgoJ1tzcGVjaWFsaXN0XScpO1xuICAgICAgICAgICAgICAgIG5leHQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGZxTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGFscmVhZHlUYWdnZWQgPyBkZXNjIDogYFtzcGVjaWFsaXN0XSAke2Rlc2N9YCxcbiAgICAgICAgICAgICAgICAgICAgYW5ub3RhdGlvbnM6IHRvb2wuYW5ub3RhdGlvbnMsXG4gICAgICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0b29sLmlucHV0U2NoZW1hLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9vbHNMaXN0ID0gbmV4dDtcblxuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFNldHVwIHRvb2xzOiAke3RoaXMudG9vbHNMaXN0Lmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVUb29sQ2FsbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICBjb25zdCBbY2F0ZWdvcnksIC4uLnJlc3RdID0gdG9vbE5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgY29uc3QgZXhlY3V0b3IgPSB0aGlzLnRvb2xzW2NhdGVnb3J5XTtcbiAgICAgICAgaWYgKCFleGVjdXRvcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleGVjdXRvci5leGVjdXRlKHJlc3Quam9pbignXycpLCBhcmdzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29sczogYW55W10pOiB2b2lkIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBVcGRhdGluZyBlbmFibGVkIHRvb2xzOiAke2VuYWJsZWRUb29scy5sZW5ndGh9IHRvb2xzYCk7XG4gICAgICAgIHRoaXMuZW5hYmxlZFRvb2xzID0gZW5hYmxlZFRvb2xzO1xuICAgICAgICB0aGlzLnNldHVwVG9vbHMoKTtcbiAgICAgICAgLy8gTm90aWZ5IGFsbCBsaXZlIHNlc3Npb25zIHRoYXQgdGhlIHRvb2wgbGlzdCBjaGFuZ2VkLlxuICAgICAgICBmb3IgKGNvbnN0IHsgc2RrU2VydmVyIH0gb2YgdGhpcy5zZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgc2RrU2VydmVyLnNlbmRUb29sTGlzdENoYW5nZWQoKS5jYXRjaCgoKSA9PiB7IC8qIHBlZXIgbWF5IGhhdmUgZHJvcHBlZCAqLyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRTZXR0aW5ncygpOiBNQ1BTZXJ2ZXJTZXR0aW5ncyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlSHR0cFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFVybCA9IHVybC5wYXJzZShyZXEudXJsIHx8ICcnLCB0cnVlKTtcbiAgICAgICAgY29uc3QgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cbiAgICAgICAgLy8gQ09SUyBpcyB3aWxkY2FyZCBzbyB0aGUgQ29jb3MgQ3JlYXRvciBwYW5lbCB3ZWJ2aWV3ICh3aGljaCBsb2Fkc1xuICAgICAgICAvLyBmcm9tIGEgYGZpbGU6Ly9gIG9yIGBkZXZ0b29sczovL2Agb3JpZ2luKSBjYW4gaGl0IHRoaXMgZW5kcG9pbnQuXG4gICAgICAgIC8vIFRoZSBzZXJ2ZXIgb25seSBsaXN0ZW5zIG9uIDEyNy4wLjAuMSwgc28gZXh0ZXJuYWwgYXR0YWNrZXJzIGNhbid0XG4gICAgICAgIC8vIHJlYWNoIGl0OyB0aGUgd2lsZGNhcmQgZG9lcyBtZWFuIGFueSBsb2NhbCB3ZWIgcGFnZSBpbiB0aGUgdXNlcidzXG4gICAgICAgIC8vIGJyb3dzZXIgY291bGQgcHJvYmUgaXQsIHdoaWNoIGlzIGFjY2VwdGFibGUgZm9yIGEgZGV2ZWxvcGVyIHRvb2wuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEVYQ0VQVElPTjogL2dhbWUvKiBlbmRwb2ludHMgYXJlIHNjb3BlZCB0byBhIHN0cmljdCBvcmlnaW5cbiAgICAgICAgLy8gYWxsb3dsaXN0ICh2Mi43LjAgIzIgZml4IG9uIHYyLjYuMCByZXZpZXcgVzcpLiBUaGUgcmVhc29uaW5nOlxuICAgICAgICAvLyAvZ2FtZS9yZXN1bHQgaXMgYSB3cml0ZSBlbmRwb2ludCB0aGF0IG11dGF0ZXMgdGhlIHNpbmdsZS1mbGlnaHRcbiAgICAgICAgLy8gcXVldWUgc3RhdGUgc2hhcmVkIGJ5IEFMTCBNQ1Agc2Vzc2lvbnMgb24gdGhpcyBob3N0LiBBIG1hbGljaW91c1xuICAgICAgICAvLyBsb2NhbCBicm93c2VyIHRhYiB3aXRoIHRoZSB3aWxkY2FyZCBDT1JTIGNvdWxkIHRpbWUgYSBQT1NUIHRvXG4gICAgICAgIC8vIHJhY2UgYSBsZWdpdGltYXRlIGNvbW1hbmQncyByZXN1bHQuIC9nYW1lL2NvbW1hbmQgYW5kXG4gICAgICAgIC8vIC9nYW1lL3N0YXR1cyBhcmUgcmVhZHMgYnV0IHRoZSBsZWdpdGltYXRlIGNhbGxlciAoR2FtZURlYnVnQ2xpZW50XG4gICAgICAgIC8vIHJ1bm5pbmcgaW5zaWRlIGNvY29zIHByZXZpZXcgLyBicm93c2VyIHByZXZpZXcpIGlzIHdlbGwta25vd24uXG4gICAgICAgIGNvbnN0IGlzR2FtZUVuZHBvaW50ID0gcGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9nYW1lLycpID09PSB0cnVlO1xuICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMSAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENsYXVkZSBzaW5nbGUtcmV2aWV3ZXIg8J+foSk6XG4gICAgICAgIC8vIGhvaXN0IHJlc29sdmVHYW1lQ29yc09yaWdpbiBzbyB0aGUgT1BUSU9OUyBicmFuY2gsIHRoZSByZXNwb25zZS1cbiAgICAgICAgLy8gaGVhZGVyIGJyYW5jaCwgYW5kIHRoZSBwb3N0LUNPUlMgNDAzIGVuZm9yY2VtZW50IChsYXRlciBpblxuICAgICAgICAvLyByZXF1ZXN0SGFuZGxlcikgc2hhcmUgb25lIGNsYXNzaWZpY2F0aW9uIGNhbGwuXG4gICAgICAgIGNvbnN0IGdhbWVBY2FvID0gaXNHYW1lRW5kcG9pbnRcbiAgICAgICAgICAgID8gcmVzb2x2ZUdhbWVDb3JzT3JpZ2luKHJlcS5oZWFkZXJzLm9yaWdpbilcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgaWYgKGlzR2FtZUVuZHBvaW50KSB7XG4gICAgICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMSAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENsYXVkZSBzaW5nbGUtcmV2aWV3ZXIg8J+foSk6XG4gICAgICAgICAgICAvLyBlbWl0IFZhcnk6IE9yaWdpbiBvbiBCT1RIIGFsbG93LSBhbmQgZGVueS0gYnJhbmNoZXMgc28gYSBzaGFyZWRcbiAgICAgICAgICAgIC8vIGJyb3dzZXIgY2FjaGUgY2Fubm90IHNlcnZlIGEgY2FjaGVkIGFsbG93ZWQtb3JpZ2luIHJlc3BvbnNlIHRvIGFcbiAgICAgICAgICAgIC8vIGxhdGVyIGRpc2FsbG93ZWQgb3JpZ2luIChvciB2aWNlIHZlcnNhKS4gVGhlIGhlYWRlciBpcyBzZXQgb25jZVxuICAgICAgICAgICAgLy8gaGVyZSByZWdhcmRsZXNzIG9mIGFjYW8gb3V0Y29tZS5cbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ1ZhcnknLCAnT3JpZ2luJyk7XG4gICAgICAgICAgICBpZiAoZ2FtZUFjYW8gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCBnYW1lQWNhbyk7XG4gICAgICAgICAgICB9IC8vIGVsc2U6IG9taXQgQUNBTyBlbnRpcmVseTsgYnJvd3NlcnMgd2lsbCBibG9jayB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBSZWplY3QgcHJlZmxpZ2h0IGZyb20gZGlzYWxsb3dlZCBvcmlnaW5zIGZhc3Qgc28gdGhlIHJlcXVlc3RcbiAgICAgICAgICAgIC8vIG5ldmVyIHJlYWNoZXMgdGhlIHF1ZXVlIGxvZ2ljLlxuICAgICAgICAgICAgaWYgKHJlcS5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgICAgICAgICAgIGlmIChnYW1lQWNhbyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMyk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCwgUE9TVCwgT1BUSU9OUycpO1xuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCAnQ29udGVudC1UeXBlJyk7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDQpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ2xhdWRlIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6XG4gICAgICAgICAgICAvLyBlbWl0IFZhcnk6IE9yaWdpbiB1bmlmb3JtbHkgYWNyb3NzIGFsbCBicmFuY2hlcyBzbyBhIGZ1dHVyZVxuICAgICAgICAgICAgLy8gY2hhbmdlIGludHJvZHVjaW5nIGR5bmFtaWMgQUNBTyBvbiAvbWNwIGNhbid0IHF1aWV0bHlcbiAgICAgICAgICAgIC8vIHJlc3VyZmFjZSB0aGUgY2FjaGUtcG9pc29uaW5nIGlzc3VlIFQtVjI4LTEganVzdCBoYXJkZW5lZFxuICAgICAgICAgICAgLy8gYWdhaW5zdCBvbiAvZ2FtZS8qLiBDaGVhcCB0byBzZXQ7IG5ldmVyIGhhcm1mdWwuXG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdWYXJ5JywgJ09yaWdpbicpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsIFBPU1QsIE9QVElPTlMsIERFTEVURScpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24sIG1jcC1zZXNzaW9uLWlkLCBtY3AtcHJvdG9jb2wtdmVyc2lvbicpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnbWNwLXNlc3Npb24taWQnKTtcblxuICAgICAgICAgICAgaWYgKHJlcS5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjA0KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9tY3AnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVNY3BSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvaGVhbHRoJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgLy8gVC1WMjYtMTogaW5jbHVkZSBHYW1lRGVidWdDbGllbnQgbGl2ZW5lc3Mgc28gQUkgLyB1c2VyIGNhblxuICAgICAgICAgICAgICAgIC8vIHZlcmlmeSB0aGUgcG9sbGluZyBjbGllbnQgaXMgdXAgYmVmb3JlIGlzc3VpbmdcbiAgICAgICAgICAgICAgICAvLyBkZWJ1Z19nYW1lX2NvbW1hbmQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ2FtZUNsaWVudCA9IGdldENsaWVudFN0YXR1cygpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICAgICAgICAgICAgICAgIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGdhbWVDbGllbnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbm5lY3RlZDogZ2FtZUNsaWVudC5jb25uZWN0ZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXN0UG9sbEF0OiBnYW1lQ2xpZW50Lmxhc3RQb2xsQXQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjcuMCAjMjogZW5mb3JjZSBvcmlnaW4gYWxsb3dsaXN0IGZvciAvZ2FtZS8qIHdyaXRlcyB0b28uXG4gICAgICAgICAgICAvLyBCcm93c2VyIHByZWZsaWdodCBpcyBhbHJlYWR5IGJsb2NrZWQgKGFib3ZlKSBidXQgYSBub24tYnJvd3NlclxuICAgICAgICAgICAgLy8gY2xpZW50IChvciBhIGJyb3dzZXIgd2l0aCBzaW1wbGUtcmVxdWVzdCBieXBhc3MpIGNhbiBzdGlsbFxuICAgICAgICAgICAgLy8gUE9TVC9HRVQuIFJlamVjdCA0MDMgaGVyZSB0byBoYXJkZW4gdGhlIHF1ZXVlIGFnYWluc3RcbiAgICAgICAgICAgIC8vIGNyb3NzLXRhYiBoaWphY2suXG4gICAgICAgICAgICAvLyB2Mi44LjAgVC1WMjgtMTogcmV1c2UgdGhlIGFscmVhZHktY2xhc3NpZmllZCBnYW1lQWNhbyBpbnN0ZWFkIG9mXG4gICAgICAgICAgICAvLyByZS1ydW5uaW5nIHJlc29sdmVHYW1lQ29yc09yaWdpbiAoY2hlYXAgY2FsbCBidXQgaXQga2VwdCBvcmlnaW5cbiAgICAgICAgICAgIC8vIGNsYXNzaWZpY2F0aW9uIGxvZ2ljIGluIHR3byBwbGFjZXMpLlxuICAgICAgICAgICAgaWYgKGlzR2FtZUVuZHBvaW50ICYmIGdhbWVBY2FvID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogJ29yaWdpbiBub3QgYWxsb3dlZCBmb3IgL2dhbWUvKiBlbmRwb2ludHMnIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgcG9sbHMgdGhpcyBmb3IgdGhlIG5leHQgcGVuZGluZyBjb21tYW5kLlxuICAgICAgICAgICAgLy8gU2luZ2xlLWZsaWdodCBxdWV1ZSBsaXZlcyBpbiBsaWIvZ2FtZS1jb21tYW5kLXF1ZXVlLnRzLlxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvY29tbWFuZCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbWQgPSBjb25zdW1lUGVuZGluZ0NvbW1hbmQoKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoY21kID8/IG51bGwpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvZ2FtZS9yZXN1bHQnICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICAgICAgICAgIGxldCBwYXJzZWQ6IGFueTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBwYXJzZWQgPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiBgSW52YWxpZCBKU09OOiAke2Vyci5tZXNzYWdlfWAgfSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjbGF1ZGUgVzIpOiByZXF1aXJlIGJvdGggaWQgKHN0cmluZykgYW5kXG4gICAgICAgICAgICAgICAgLy8gc3VjY2VzcyAoYm9vbGVhbikuIFdpdGhvdXQgdGhlIHN1Y2Nlc3MgY2hlY2ssIGEgYnVnZ3kgY2xpZW50XG4gICAgICAgICAgICAgICAgLy8gcG9zdGluZyB7aWQsIGVycm9yfSB3b3VsZCBzbGlwIHRocm91Z2ggYW5kIGRvd25zdHJlYW0gY29kZVxuICAgICAgICAgICAgICAgIC8vIHdvdWxkIHRyZWF0IHN1Y2Nlc3MgIT09IGZhbHNlIGFzIHRydXRoeS5cbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLmlkICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFyc2VkLnN1Y2Nlc3MgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogJ2V4cGVjdGVkIHtpZDogc3RyaW5nLCBzdWNjZXNzOiBib29sZWFuLCBkYXRhPywgZXJyb3I/fScgfSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGFjY2VwdGVkID0gc2V0Q29tbWFuZFJlc3VsdChwYXJzZWQpO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoYWNjZXB0ZWQub2sgPyAyMDQgOiA0MDksIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGFjY2VwdGVkLm9rID8gJycgOiBKU09OLnN0cmluZ2lmeSh7IG9rOiBmYWxzZSwgZXJyb3I6IGFjY2VwdGVkLnJlYXNvbiB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvc3RhdHVzJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShnZXRDbGllbnRTdGF0dXMoKSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvdG9vbHMnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgdG9vbHM6IHRoaXMuZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWU/LnN0YXJ0c1dpdGgoJy9hcGkvJykgJiYgcmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcSwgcmVzLCBwYXRobmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ05vdCBmb3VuZCcgfSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIEhUVFAgcmVxdWVzdCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIC8vIHYyLjYuMTogNDEzIHN1cmZhY2UgZm9yIGJvZHktY2FwIHJlamVjdGlvbnMgc28gY2xpZW50c1xuICAgICAgICAgICAgICAgIC8vIGNhbiBkaXN0aW5ndWlzaCBcInlvdSBzZW50IHRvbyBtdWNoXCIgZnJvbSBzZXJ2ZXIgZmF1bHRzLlxuICAgICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEJvZHlUb29MYXJnZUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDEzLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogZXJyb3IubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLCBkZXRhaWxzOiBlcnJvcj8ubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZU1jcFJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcS5oZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBHRVQgKHNlcnZlci1pbml0aWF0ZWQgU1NFKSBhbmQgREVMRVRFIChleHBsaWNpdCBzZXNzaW9uIGNsb3NlKSBib3RoXG4gICAgICAgIC8vIHJlcXVpcmUgYW4gZXhpc3Rpbmcgc2Vzc2lvbi4gUGVyIFN0cmVhbWFibGUgSFRUUCBzcGVjLCBHRVQgd2l0aG91dFxuICAgICAgICAvLyBzZXNzaW9uIGlzIFwibWV0aG9kIG5vdCBhbGxvd2VkXCI7IERFTEVURSB3aXRob3V0IHNlc3Npb24gaXMgXCJub3QgZm91bmRcIi5cbiAgICAgICAgaWYgKHJlcS5tZXRob2QgIT09ICdQT1NUJykge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBzZXNzaW9uSWQgPyB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFlbnRyeSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzR2V0ID0gcmVxLm1ldGhvZCA9PT0gJ0dFVCc7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZChpc0dldCA/IDQwNSA6IDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjAwMCwgaXNHZXRcbiAgICAgICAgICAgICAgICAgICAgPyAnTWV0aG9kIG5vdCBhbGxvd2VkIHdpdGhvdXQgYWN0aXZlIHNlc3Npb24nXG4gICAgICAgICAgICAgICAgICAgIDogJ1Nlc3Npb24gbm90IGZvdW5kJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVudHJ5Lmxhc3RBY3Rpdml0eUF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGF3YWl0IGVudHJ5LnRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBPU1Q6IHJlYWQgYm9keSBvbmNlIHNvIHdlIGNhbiBkZXRlY3QgaW5pdGlhbGl6ZSBiZWZvcmUgZGlzcGF0Y2guXG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBsZXQgcGFyc2VkQm9keTogYW55O1xuICAgICAgICBpZiAoYm9keS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHBhcnNlZEJvZHkgPSBKU09OLnBhcnNlKGJvZHkpO1xuICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzI3MDAsXG4gICAgICAgICAgICAgICAgICAgIGBQYXJzZSBlcnJvcjogJHtwYXJzZUVycm9yLm1lc3NhZ2V9LiBCb2R5OiAke2JvZHkuc3Vic3RyaW5nKDAsIDIwMCl9YCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gc2Vzc2lvbklkID8gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBleGlzdGluZy5sYXN0QWN0aXZpdHlBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBleGlzdGluZy50cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcywgcGFyc2VkQm9keSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOZXcgc2Vzc2lvbiBtdXN0IGNvbWUgd2l0aCBhbiBpbml0aWFsaXplIHJlcXVlc3QuXG4gICAgICAgIGlmICghaXNJbml0aWFsaXplUmVxdWVzdChwYXJzZWRCb2R5KSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoanNvblJwY0Vycm9yKC0zMjAwMCwgJ0JhZCBSZXF1ZXN0OiBObyB2YWxpZCBzZXNzaW9uIElEIHByb3ZpZGVkJykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIFNlcnZlciBmaXJzdCBzbyB0aGUgdHJhbnNwb3J0IGNhbGxiYWNrIGNsb3N1cmUgY2FwdHVyZXNcbiAgICAgICAgLy8gYW4gYWxyZWFkeS1pbml0aWFsaXplZCBiaW5kaW5nIChhdm9pZHMgVERaLXN0eWxlIG9yZGVyaW5nIHN1cnByaXNlcykuXG4gICAgICAgIC8vIFQtVjI1LTM6IHByZS1jcmVhdGUgdGhlIHBlci1zZXNzaW9uIHN1YnNjcmlwdGlvbnMgU2V0IGFuZCBwYXNzIGl0XG4gICAgICAgIC8vIGludG8gYnVpbGRTZGtTZXJ2ZXIgc28gdGhlIFN1YnNjcmliZS9VbnN1YnNjcmliZSBoYW5kbGVycyBhbmQgdGhlXG4gICAgICAgIC8vIFNlc3Npb25FbnRyeSBib3RoIHJlZmVyZW5jZSB0aGUgc2FtZSBTZXQgaW5zdGFuY2UuXG4gICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgICAgY29uc3Qgc2RrU2VydmVyID0gdGhpcy5idWlsZFNka1NlcnZlcihzdWJzY3JpcHRpb25zKTtcbiAgICAgICAgY29uc3QgdHJhbnNwb3J0ID0gbmV3IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0KHtcbiAgICAgICAgICAgIHNlc3Npb25JZEdlbmVyYXRvcjogKCkgPT4gcmFuZG9tVVVJRCgpLFxuICAgICAgICAgICAgZW5hYmxlSnNvblJlc3BvbnNlOiB0cnVlLFxuICAgICAgICAgICAgb25zZXNzaW9uaW5pdGlhbGl6ZWQ6IChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuc2V0KGlkLCB7IHRyYW5zcG9ydCwgc2RrU2VydmVyLCBsYXN0QWN0aXZpdHlBdDogRGF0ZS5ub3coKSwgc3Vic2NyaXB0aW9ucyB9KTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHNlc3Npb24gaW5pdGlhbGl6ZWQ6ICR7aWR9ICh0b3RhbDogJHt0aGlzLnNlc3Npb25zLnNpemV9KWApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uc2Vzc2lvbmNsb3NlZDogKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gc2Vzc2lvbiBjbG9zZWQ6ICR7aWR9IChyZW1haW5pbmc6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBhd2FpdCBzZGtTZXJ2ZXIuY29ubmVjdCh0cmFuc3BvcnQpO1xuICAgICAgICBhd2FpdCB0cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcywgcGFyc2VkQm9keSk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLmNsZWFudXBJbnRlcnZhbCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmNsZWFudXBJbnRlcnZhbCk7XG4gICAgICAgICAgICB0aGlzLmNsZWFudXBJbnRlcnZhbCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVC1WMjUtMzogdGVhciBkb3duIHRoZSBicmlkZ2UgYmVmb3JlIGNsb3Npbmcgc2Vzc2lvbnMgc28gYW55XG4gICAgICAgIC8vIGluLWZsaWdodCBub3RpZmljYXRpb24gdGltZXJzIGFyZSBjbGVhcmVkIGFuZCBubyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdHJ5IHRvIHB1c2ggdG8gY2xvc2VkIHRyYW5zcG9ydHMuXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0QnJpZGdlLnN0b3AoKTtcbiAgICAgICAgZm9yIChjb25zdCB7IHRyYW5zcG9ydCB9IG9mIHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdHJhbnNwb3J0LmNsb3NlKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1BTZXJ2ZXJdIHRyYW5zcG9ydCBjbG9zZSBlcnJvcjonLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlc3Npb25zLmNsZWFyKCk7XG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgIC8vIGNsb3NlKCkgb25seSByZWZ1c2VzIE5FVyBjb25uZWN0aW9uczsga2VlcC1hbGl2ZSBzb2NrZXRzIHN0YXlcbiAgICAgICAgICAgIC8vIG9wZW4gYW5kIHdvdWxkIGJsb2NrIGNsb3NlKCkgZm9yZXZlci4gRm9yY2UgdGhlbSB0byBkcm9wIHRvby5cbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlci5jbG9zZUFsbENvbm5lY3Rpb25zPy4oKTtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEuY2xvc2UoKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyID0gbnVsbDtcbiAgICAgICAgICAgIGxvZ2dlci5pbmZvKCdbTUNQU2VydmVyXSBIVFRQIHNlcnZlciBzdG9wcGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0U3RhdHVzKCk6IFNlcnZlclN0YXR1cyB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBydW5uaW5nOiAhIXRoaXMuaHR0cFNlcnZlcixcbiAgICAgICAgICAgIHBvcnQ6IHRoaXMuc2V0dGluZ3MucG9ydCxcbiAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuc2Vzc2lvbnMuc2l6ZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZVNpbXBsZUFQSVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBwYXRobmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGhuYW1lLnNwbGl0KCcvJykuZmlsdGVyKHAgPT4gcCk7XG4gICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgQVBJIHBhdGguIFVzZSAvYXBpL3tjYXRlZ29yeX0ve3Rvb2xfbmFtZX0nIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsVG9vbE5hbWUgPSBgJHtwYXRoUGFydHNbMV19XyR7cGF0aFBhcnRzWzJdfWA7XG5cbiAgICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRCb2R5KHJlcSk7XG4gICAgICAgIGxldCBwYXJhbXM6IGFueTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHBhcmFtcyA9IGJvZHkgPyBKU09OLnBhcnNlKGJvZHkpIDoge307XG4gICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgICAgICAgICAgZGV0YWlsczogcGFyc2VFcnJvci5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkQm9keTogYm9keS5zdWJzdHJpbmcoMCwgMjAwKSxcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChmdWxsVG9vbE5hbWUsIHBhcmFtcyk7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIHRvb2w6IGZ1bGxUb29sTmFtZSwgcmVzdWx0IH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSBTaW1wbGUgQVBJIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgICAgIGlmICghcmVzLmhlYWRlcnNTZW50KSB7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlLCB0b29sOiBwYXRobmFtZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFNpbXBsaWZpZWRUb29sc0xpc3QoKTogYW55W10ge1xuICAgICAgICByZXR1cm4gdGhpcy50b29sc0xpc3QubWFwKHRvb2wgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSB0b29sLm5hbWUuc3BsaXQoJ18nKTtcbiAgICAgICAgICAgIGNvbnN0IGNhdGVnb3J5ID0gcGFydHNbMF07XG4gICAgICAgICAgICBjb25zdCB0b29sTmFtZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJ18nKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxuICAgICAgICAgICAgICAgIGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIHRvb2xOYW1lLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgIGFwaVBhdGg6IGAvYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9YCxcbiAgICAgICAgICAgICAgICBjdXJsRXhhbXBsZTogdGhpcy5nZW5lcmF0ZUN1cmxFeGFtcGxlKGNhdGVnb3J5LCB0b29sTmFtZSwgdG9vbC5pbnB1dFNjaGVtYSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlQ3VybEV4YW1wbGUoY2F0ZWdvcnk6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgc2NoZW1hOiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBzYW1wbGVQYXJhbXMgPSB0aGlzLmdlbmVyYXRlU2FtcGxlUGFyYW1zKHNjaGVtYSk7XG4gICAgICAgIGNvbnN0IGpzb25TdHJpbmcgPSBKU09OLnN0cmluZ2lmeShzYW1wbGVQYXJhbXMsIG51bGwsIDIpO1xuICAgICAgICByZXR1cm4gYGN1cmwgLVggUE9TVCBodHRwOi8vMTI3LjAuMC4xOiR7dGhpcy5zZXR0aW5ncy5wb3J0fS9hcGkvJHtjYXRlZ29yeX0vJHt0b29sTmFtZX0gXFxcXFxuICAtSCBcIkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvblwiIFxcXFxcbiAgLWQgJyR7anNvblN0cmluZ30nYDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlU2FtcGxlUGFyYW1zKHNjaGVtYTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKCFzY2hlbWEgfHwgIXNjaGVtYS5wcm9wZXJ0aWVzKSByZXR1cm4ge307XG4gICAgICAgIGNvbnN0IHNhbXBsZTogYW55ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoc2NoZW1hLnByb3BlcnRpZXMgYXMgYW55KSkge1xuICAgICAgICAgICAgY29uc3QgcHJvcFNjaGVtYSA9IHByb3AgYXMgYW55O1xuICAgICAgICAgICAgc3dpdGNoIChwcm9wU2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyAnZXhhbXBsZV9zdHJpbmcnO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyA0MjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZVtrZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0ID8/IHsgeDogMCwgeTogMCwgejogMCB9O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9ICdleGFtcGxlX3ZhbHVlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2FtcGxlO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgaWYgKHRoaXMudXBkYXRpbmcpIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQU2VydmVyXSB1cGRhdGVTZXR0aW5ncyBpZ25vcmVkIOKAlCBhbm90aGVyIHVwZGF0ZSBpbiBwcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRpbmcgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICAgICAgc2V0RGVidWdMb2dFbmFibGVkKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcbiAgICAgICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBwYW5lbCB0b2dnbGVzIGZvciBlbmFibGVFZGl0b3JDb250ZXh0RXZhbCBtdXN0XG4gICAgICAgICAgICAvLyB0YWtlIGVmZmVjdCBpbW1lZGlhdGVseS4gV2l0aG91dCB0aGlzIHJlLWFwcGx5LCBkaXNhYmxpbmcgdGhlXG4gICAgICAgICAgICAvLyBzZXR0aW5nIGFmdGVyIGVuYWJsZSB3b3VsZCBsZWF2ZSB0aGUgcnVudGltZSBmbGFnIE9OIHVudGlsIHRoZVxuICAgICAgICAgICAgLy8gZW50aXJlIGV4dGVuc2lvbiByZWxvYWRzIOKAlCBhIHNlY3VyaXR5LXJlbGV2YW50IGdhcCBiZWNhdXNlIHRoZVxuICAgICAgICAgICAgLy8gZWRpdG9yLWNvbnRleHQgZXZhbCB3b3VsZCBrZWVwIGFjY2VwdGluZyBBSS1nZW5lcmF0ZWQgaG9zdC1zaWRlXG4gICAgICAgICAgICAvLyBjb2RlIGRlc3BpdGUgdGhlIHVzZXIncyBwYW5lbCBjaG9pY2UuXG4gICAgICAgICAgICBzZXRFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlRWRpdG9yQ29udGV4dEV2YWwgPz8gZmFsc2UpO1xuICAgICAgICAgICAgLy8gdjIuNC44IEEzOiByZS1hcHBseSBzY2VuZS1sb2ctY2FwdHVyZSBmbGFnIG9uIGV2ZXJ5IHNldHRpbmdzXG4gICAgICAgICAgICAvLyBjaGFuZ2Ugc28gcGFuZWwgdG9nZ2xlIHRha2VzIGVmZmVjdCBpbW1lZGlhdGVseSwgbWlycm9yaW5nIHRoZVxuICAgICAgICAgICAgLy8gZWRpdG9yQ29udGV4dEV2YWwgcmUtYXBwbHkgcGF0dGVybi5cbiAgICAgICAgICAgIHNldFNjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoc2V0dGluZ3MuZW5hYmxlU2NlbmVMb2dDYXB0dXJlID8/IHRydWUpO1xuICAgICAgICAgICAgaWYgKHRoaXMuaHR0cFNlcnZlcikge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc3RvcCgpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gdjIuNy4wICMyIChXNyBmcm9tIHYyLjYuMCByZXZpZXcpOiByZXNvbHZlIHRoZSBBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cbi8vIGhlYWRlciB2YWx1ZSBmb3IgL2dhbWUvKiBlbmRwb2ludHMuIFJldHVybnM6XG4vLyAgIC0gdGhlIGVjaG8nZCBvcmlnaW4gc3RyaW5nIHdoZW4gdGhlIG9yaWdpbiBpcyBpbiBvdXIgdHJ1c3QgbGlzdFxuLy8gICAtIHRoZSBsaXRlcmFsICdudWxsJyBzdHJpbmcgd2hlbiB0aGUgcmVxdWVzdCBoYXMgT3JpZ2luOiBudWxsIChmaWxlOi8vXG4vLyAgICAgVVJMcyBzZW5kIHRoaXM7IGNvY29zIFBJRSB3ZWJ2aWV3IG9mdGVuIHJ1bnMgZnJvbSBmaWxlOi8vKVxuLy8gICAtIHRoZSB3aWxkY2FyZCAnKicgZm9yIG5vLU9yaWdpbiByZXF1ZXN0cyAoY3VybC9Ob2RlIGNsaWVudHMsIHNhbWUtXG4vLyAgICAgb3JpZ2luIHJlcXVlc3RzIHRoYXQgZG9uJ3Qgc2VuZCBPcmlnaW4pIOKAlCBDT1JTIG9ubHkgbWF0dGVycyBpblxuLy8gICAgIGJyb3dzZXJzLCBhbmQgc2FtZS1vcmlnaW4gLyBuby1PcmlnaW4gcGF0aHMgY2FuJ3QgYmUgY3Jvc3MtdGFiXG4vLyAgICAgYXR0YWNrZXJzXG4vLyAgIC0gbnVsbCAodGhlIEpTIHZhbHVlKSB3aGVuIHRoZSBvcmlnaW4gaXMgZGlzYWxsb3dlZCDihpIgY2FsbGVyIG9taXRzIHRoZVxuLy8gICAgIEFDQU8gaGVhZGVyIHNvIGJyb3dzZXJzIGJsb2NrIHRoZSByZXNwb25zZVxuZnVuY3Rpb24gcmVzb2x2ZUdhbWVDb3JzT3JpZ2luKG9yaWdpbjogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCfn6EgKyBHZW1pbmkg8J+foSk6IG5vZGUgaHR0cCBhbGxvd3MgZHVwbGljYXRlXG4gICAgLy8gT3JpZ2luIGhlYWRlcnMsIHdoaWNoIHByb2R1Y2VzIGEgc3RyaW5nW10gaGVyZS4gV0hBVFdHIFVSTCB3b3VsZFxuICAgIC8vIHNlcmlhbGl6ZSB0aGF0IHRvIFwiYSxiXCIgYW5kIGVpdGhlciB0aHJvdyBvciBtaXMtY2xhc3NpZnkuIFRyZWF0IGFzXG4gICAgLy8gZGlzYWxsb3dlZCDigJQgYSBsZWdpdGltYXRlIGJyb3dzZXIgc2VuZHMgZXhhY3RseSBvbmUgT3JpZ2luLlxuICAgIGlmIChBcnJheS5pc0FycmF5KG9yaWdpbikpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChvcmlnaW4gPT09IHVuZGVmaW5lZCB8fCBvcmlnaW4gPT09ICcnKSB7XG4gICAgICAgIC8vIE5vIE9yaWdpbiBoZWFkZXIg4oaSIG5vdCBhIGJyb3dzZXIgZmV0Y2guIEFsbG93LlxuICAgICAgICByZXR1cm4gJyonO1xuICAgIH1cbiAgICBpZiAob3JpZ2luID09PSAnbnVsbCcpIHtcbiAgICAgICAgLy8gZmlsZTovLyBwYWdlcyBhbmQgc29tZSBzYW5kYm94ZWQgaWZyYW1lcyBzZW5kICdudWxsJy4gQWxsb3c6XG4gICAgICAgIC8vIGNvY29zIFBJRSB3ZWJ2aWV3IG9mdGVuIGZhbGxzIGludG8gdGhpcyBidWNrZXQuXG4gICAgICAgIHJldHVybiAnbnVsbCc7XG4gICAgfVxuICAgIC8vIEFsbG93IGxvb3BiYWNrIEhUVFAgb3JpZ2lucyAoY29jb3MgYnJvd3NlciBwcmV2aWV3IGF0XG4gICAgLy8gaHR0cDovL2xvY2FsaG9zdDo3NDU2IGV0Yy4pIGFuZCBkZXZ0b29scy9maWxlIHNjaGVtZXMuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdSA9IG5ldyBVUkwob3JpZ2luKTtcbiAgICAgICAgaWYgKHUucHJvdG9jb2wgPT09ICdmaWxlOicgfHwgdS5wcm90b2NvbCA9PT0gJ2RldnRvb2xzOicpIHJldHVybiBvcmlnaW47XG4gICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGdlbWluaSDwn5S0KTogV0hBVFdHIFVSTCBrZWVwc1xuICAgICAgICAvLyBicmFja2V0cyBhcm91bmQgSVB2NiBob3N0bmFtZXMgb24gTm9kZSAxOCssIGJ1dCBvbGRlciBidW5kbGVkXG4gICAgICAgIC8vIE5vZGUgYnVpbGRzIG1heSBzdHJpcCB0aGVtIOKAlCBhY2NlcHQgYm90aCB0byBiZSBwb3J0YWJsZSBhY3Jvc3NcbiAgICAgICAgLy8gd2hhdGV2ZXIgTm9kZSB0aGUgY29jb3MgZWRpdG9yIHNoaXBzIGF0IGFueSBnaXZlbiB2ZXJzaW9uLlxuICAgICAgICBpZiAoKHUucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdS5wcm90b2NvbCA9PT0gJ2h0dHBzOicpXG4gICAgICAgICAgICAmJiAodS5ob3N0bmFtZSA9PT0gJ2xvY2FsaG9zdCcgfHwgdS5ob3N0bmFtZSA9PT0gJzEyNy4wLjAuMSdcbiAgICAgICAgICAgICAgICB8fCB1Lmhvc3RuYW1lID09PSAnWzo6MV0nIHx8IHUuaG9zdG5hbWUgPT09ICc6OjEnKSkge1xuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbjtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBNYWxmb3JtZWQgT3JpZ2luIGhlYWRlciDihpIgcmVqZWN0LlxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBjYXAgcmVxdWVzdCBib2RpZXMgYXQgMzIgTUIuXG4vLyBTY3JlZW5zaG90cyBjb21lIGJhY2sgYXMgZGF0YSBVUkxzIHRoYXQgY2FuIGxlZ2l0aW1hdGVseSBiZSBhIGZldyBNQiBvblxuLy8gNGsgY2FudmFzZXMsIHNvIHdlIHNldCB0aGUgY2FwIGdlbmVyb3VzbHkgcmF0aGVyIHRoYW4gcGVyLWVuZHBvaW50LlxuLy8gQWJvdmUgdGhlIGNhcCB3ZSBkZXN0cm95IHRoZSBjb25uZWN0aW9uIHNvIHRoZSBjbGllbnQgc2VlcyBhIGhhcmQgY2xvc2Vcbi8vIHJhdGhlciB0aGFuIGEgc2xvdyB0cnV0aGZ1bCA0MTMgKGF2b2lkcyB0aGVtIGNvbnRpbnVpbmcgdG8gc3RyZWFtKS5cbi8vIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+foSArIENvZGV4IPCfn6EpOiBidW1wZWQgMzIg4oaSIDY0IE1CIHNvXG4vLyBNZWRpYVJlY29yZGVyIG91dHB1dCBhdCBoaWdoIGJpdHJhdGVzICg1LTIwIE1icHMgw5cgMzAtNjBzID0gMTgtMTUwIE1CKVxuLy8gaGFzIG1vcmUgaGVhZHJvb20gYmVmb3JlIHRoZSB0cmFuc3BvcnQgbGF5ZXIgNDEzcy4gVGhlIGhvc3Qtc2lkZVxuLy8gTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTIGluIGRlYnVnLXRvb2xzLnRzIGlzIGhlbGQgaWRlbnRpY2FsIHNvIGJvdGhcbi8vIGNhcHMgbW92ZSB0b2dldGhlcjsgbG93ZXIgb25lIHRvIGRpYWwgYmFjayBpZiBtZW1vcnkgcHJlc3N1cmUgYmVjb21lc1xuLy8gYSBjb25jZXJuLlxuY29uc3QgTUFYX1JFUVVFU1RfQk9EWV9CWVRFUyA9IDY0ICogMTAyNCAqIDEwMjQ7XG5cbmNsYXNzIEJvZHlUb29MYXJnZUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIHJlYWRvbmx5IHN0YXR1c0NvZGUgPSA0MTM7XG4gICAgY29uc3RydWN0b3IoKSB7IHN1cGVyKGBSZXF1ZXN0IGJvZHkgZXhjZWVkcyAke01BWF9SRVFVRVNUX0JPRFlfQllURVN9IGJ5dGVzYCk7IH1cbn1cblxuZnVuY3Rpb24gcmVhZEJvZHkocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuICAgICAgICBsZXQgdG90YWwgPSAwO1xuICAgICAgICByZXEub24oJ2RhdGEnLCAoY2h1bms6IEJ1ZmZlcikgPT4ge1xuICAgICAgICAgICAgdG90YWwgKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKHRvdGFsID4gTUFYX1JFUVVFU1RfQk9EWV9CWVRFUykge1xuICAgICAgICAgICAgICAgIHJlcS5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBCb2R5VG9vTGFyZ2VFcnJvcigpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaHVua3MucHVzaChjaHVuayk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXEub24oJ2VuZCcsICgpID0+IHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICAgICAgcmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgfSk7XG59XG4iXX0=