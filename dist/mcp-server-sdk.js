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
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const log_1 = require("./lib/log");
const runtime_flags_1 = require("./lib/runtime-flags");
const registry_1 = require("./resources/registry");
const broadcast_bridge_1 = require("./lib/broadcast-bridge");
const cors_1 = require("./lib/cors");
const registry_2 = require("./prompts/registry");
const game_command_queue_1 = require("./lib/game-command-queue");
const SERVER_NAME = 'cocos-mcp-server';
const SERVER_VERSION = resolveServerVersion();
function resolveServerVersion() {
    var _a;
    try {
        const packageJson = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../package.json'), 'utf-8'));
        if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
            return packageJson.version;
        }
    }
    catch (err) {
        log_1.logger.warn(`[MCPServer] Failed to read package.json version: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
    }
    return '0.0.0';
}
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
        // /health is the only route safe to serve under any Host. All
        // mutating / privileged routes require a loopback Host header so a
        // DNS-rebinding attacker resolving attacker.com → 127.0.0.1 cannot
        // drive the editor from a victim browser tab.
        if (pathname !== '/health' && !(0, cors_1.isLoopbackHost)(req.headers.host)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'host not allowed; loopback only' }));
            return;
        }
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
            (0, cors_1.applyGameCorsHeaders)(req, res, gameAcao);
            // Reject preflight from disallowed origins fast so the request
            // never reaches the queue logic.
            if (req.method === 'OPTIONS') {
                if (gameAcao === null) {
                    res.writeHead(403);
                    res.end();
                    return;
                }
                res.writeHead(204);
                res.end();
                return;
            }
        }
        else {
            // v2.9.x polish (Claude r1 single-🟡 from v2.8.1 review):
            // emit Vary: Origin uniformly across all branches so a future
            // change introducing dynamic ACAO on /mcp can't quietly
            // resurface the cache-poisoning issue T-V28-1 just hardened
            // against on /game/*. Cheap to set; never harmful.
            (0, cors_1.applyDefaultCorsHeaders)(res);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci1zZGsuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLXNlcnZlci1zZGsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQUMzQiwyQkFBa0M7QUFDbEMsK0JBQTRCO0FBQzVCLG1DQUFvQztBQUNwQyx3RUFBbUU7QUFDbkUsMEZBQW1HO0FBQ25HLGlFQVc0QztBQUU1QyxtQ0FBdUQ7QUFDdkQsdURBQTZGO0FBRTdGLG1EQUFnRjtBQUNoRiw2REFBeUQ7QUFDekQscUNBQTJGO0FBQzNGLGlEQUEwRTtBQUMxRSxpRUFJa0M7QUFFbEMsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUM7QUFDdkMsTUFBTSxjQUFjLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztBQUU5QyxTQUFTLG9CQUFvQjs7SUFDekIsSUFBSSxDQUFDO1FBQ0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFBLGlCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUMxRixJQUFJLE9BQU8sV0FBVyxDQUFDLE9BQU8sS0FBSyxRQUFRLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDNUUsT0FBTyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQy9CLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztRQUNoQixZQUFNLENBQUMsSUFBSSxDQUFDLG9EQUFvRCxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUNELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUM7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RSxDQUFDO1FBQzVCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBYSxFQUFFLEVBQUU7WUFDN0IsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDdEIsSUFBSSxLQUFLLEdBQUcsc0JBQXNCLEVBQUUsQ0FBQztnQkFDakMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLE1BQU0sQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztnQkFDaEMsT0FBTztZQUNYLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRSxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IFNlcnZlciB9IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL2luZGV4LmpzJztcbmltcG9ydCB7IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvc3RyZWFtYWJsZUh0dHAuanMnO1xuaW1wb3J0IHtcbiAgICBDYWxsVG9vbFJlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VzUmVxdWVzdFNjaGVtYSxcbiAgICBMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hLFxuICAgIFJlYWRSZXNvdXJjZVJlcXVlc3RTY2hlbWEsXG4gICAgU3Vic2NyaWJlUmVxdWVzdFNjaGVtYSxcbiAgICBVbnN1YnNjcmliZVJlcXVlc3RTY2hlbWEsXG4gICAgTGlzdFByb21wdHNSZXF1ZXN0U2NoZW1hLFxuICAgIEdldFByb21wdFJlcXVlc3RTY2hlbWEsXG4gICAgaXNJbml0aWFsaXplUmVxdWVzdCxcbn0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1BTZXJ2ZXJTZXR0aW5ncywgU2VydmVyU3RhdHVzLCBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgc2V0RGVidWdMb2dFbmFibGVkLCBsb2dnZXIgfSBmcm9tICcuL2xpYi9sb2cnO1xuaW1wb3J0IHsgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkLCBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkIH0gZnJvbSAnLi9saWIvcnVudGltZS1mbGFncyc7XG5pbXBvcnQgeyBUb29sUmVnaXN0cnkgfSBmcm9tICcuL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IFJlc291cmNlUmVnaXN0cnksIGNyZWF0ZVJlc291cmNlUmVnaXN0cnkgfSBmcm9tICcuL3Jlc291cmNlcy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBCcm9hZGNhc3RCcmlkZ2UgfSBmcm9tICcuL2xpYi9icm9hZGNhc3QtYnJpZGdlJztcbmltcG9ydCB7IGFwcGx5R2FtZUNvcnNIZWFkZXJzLCBhcHBseURlZmF1bHRDb3JzSGVhZGVycywgaXNMb29wYmFja0hvc3QgfSBmcm9tICcuL2xpYi9jb3JzJztcbmltcG9ydCB7IFByb21wdFJlZ2lzdHJ5LCBjcmVhdGVQcm9tcHRSZWdpc3RyeSB9IGZyb20gJy4vcHJvbXB0cy9yZWdpc3RyeSc7XG5pbXBvcnQge1xuICAgIGNvbnN1bWVQZW5kaW5nQ29tbWFuZCxcbiAgICBzZXRDb21tYW5kUmVzdWx0LFxuICAgIGdldENsaWVudFN0YXR1cyxcbn0gZnJvbSAnLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcblxuY29uc3QgU0VSVkVSX05BTUUgPSAnY29jb3MtbWNwLXNlcnZlcic7XG5jb25zdCBTRVJWRVJfVkVSU0lPTiA9IHJlc29sdmVTZXJ2ZXJWZXJzaW9uKCk7XG5cbmZ1bmN0aW9uIHJlc29sdmVTZXJ2ZXJWZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFja2FnZUpzb24gPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJy4uL3BhY2thZ2UuanNvbicpLCAndXRmLTgnKSk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFja2FnZUpzb24udmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgcGFja2FnZUpzb24udmVyc2lvbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFja2FnZUpzb24udmVyc2lvbjtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBbTUNQU2VydmVyXSBGYWlsZWQgdG8gcmVhZCBwYWNrYWdlLmpzb24gdmVyc2lvbjogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgfVxuICAgIHJldHVybiAnMC4wLjAnO1xufVxuXG4vLyBJZGxlIHNlc3Npb24gc3dlZXA6IGRyb3Agc2Vzc2lvbnMgdGhhdCBoYXZlbid0IGJlZW4gdG91Y2hlZCBpbiB0aGlzIG1hbnkgbXMuXG4vLyBTZXQgY29uc2VydmF0aXZlbHkgbG9uZyBmb3IgZWRpdG9yIHVzYWdlIHdoZXJlIGEgZGV2ZWxvcGVyIG1heSBwYXVzZSB3b3JrLlxuY29uc3QgU0VTU0lPTl9JRExFX1RJTUVPVVRfTVMgPSAzMCAqIDYwICogMTAwMDtcbmNvbnN0IFNFU1NJT05fQ0xFQU5VUF9JTlRFUlZBTF9NUyA9IDYwICogMTAwMDtcblxuaW50ZXJmYWNlIFNlc3Npb25FbnRyeSB7XG4gICAgdHJhbnNwb3J0OiBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydDtcbiAgICBzZGtTZXJ2ZXI6IFNlcnZlcjtcbiAgICBsYXN0QWN0aXZpdHlBdDogbnVtYmVyO1xuICAgIC8vIFQtVjI1LTM6IHBlci1zZXNzaW9uIHJlc291cmNlIFVSSSBzdWJzY3JpcHRpb25zIGZvclxuICAgIC8vIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgcHVzaC4gRW1wdHkgc2V0IOKGkiBzZXNzaW9uXG4gICAgLy8gZ2V0cyBubyBub3RpZmljYXRpb25zIGV2ZW4gaWYgdGhlIGJyaWRnZSBmaXJlcy5cbiAgICBzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPjtcbn1cblxuZnVuY3Rpb24ganNvblJwY0Vycm9yKGNvZGU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBqc29ucnBjOiAnMi4wJywgZXJyb3I6IHsgY29kZSwgbWVzc2FnZSB9LCBpZDogbnVsbCB9KTtcbn1cblxuLyoqXG4gKiBNQ1Agc2VydmVyIGJhY2tlZCBieSB0aGUgb2ZmaWNpYWwgQG1vZGVsY29udGV4dHByb3RvY29sL3NkayBTZXJ2ZXIgK1xuICogU3RyZWFtYWJsZUhUVFBTZXJ2ZXJUcmFuc3BvcnQgKHN0YXRlZnVsIG1vZGUpLlxuICpcbiAqIEVhY2ggTUNQIGNsaWVudCBnZXRzIGl0cyBvd24gU2VydmVyICsgVHJhbnNwb3J0IHBhaXIga2V5ZWQgYnlcbiAqIGBtY3Atc2Vzc2lvbi1pZGAuIEluaXRpYWxpemUgcmVxdWVzdHMgd2l0aCBubyBzZXNzaW9uIGlkIG1pbnQgYSBuZXcgcGFpci5cbiAqIFJFU1QgZW5kcG9pbnRzICgvaGVhbHRoLCAvYXBpL3Rvb2xzLCAvYXBpL3tjYXR9L3t0b29sfSkgc2hhcmUgdGhlIHNhbWVcbiAqIHVuZGVybHlpbmcgaHR0cC5TZXJ2ZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBNQ1BTZXJ2ZXIge1xuICAgIHByaXZhdGUgc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzO1xuICAgIHByaXZhdGUgaHR0cFNlcnZlcjogaHR0cC5TZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIHNlc3Npb25zOiBNYXA8c3RyaW5nLCBTZXNzaW9uRW50cnk+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgdG9vbHM6IFRvb2xSZWdpc3RyeTtcbiAgICBwcml2YXRlIHJlc291cmNlczogUmVzb3VyY2VSZWdpc3RyeTtcbiAgICBwcml2YXRlIHByb21wdHM6IFByb21wdFJlZ2lzdHJ5O1xuICAgIHByaXZhdGUgdG9vbHNMaXN0OiBUb29sRGVmaW5pdGlvbltdID0gW107XG4gICAgcHJpdmF0ZSBlbmFibGVkVG9vbHM6IGFueVtdID0gW107XG4gICAgcHJpdmF0ZSBjbGVhbnVwSW50ZXJ2YWw6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSB1cGRhdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuICAgIC8vIFQtVjI1LTM6IGJyaWRnZSBjb2NvcyBlZGl0b3IgSVBDIGJyb2FkY2FzdHMg4oaSIE1DUFxuICAgIC8vIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQuIHN0YXJ0KCkvc3RvcCgpIGxpZmVjeWNsZVxuICAgIC8vIHRpZWQgdG8gdGhlIEhUVFAgc2VydmVyLlxuICAgIHByaXZhdGUgYnJvYWRjYXN0QnJpZGdlOiBCcm9hZGNhc3RCcmlkZ2UgPSBuZXcgQnJvYWRjYXN0QnJpZGdlKCk7XG5cbiAgICBjb25zdHJ1Y3RvcihzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MsIHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICB0aGlzLnRvb2xzID0gcmVnaXN0cnk7XG4gICAgICAgIHRoaXMucmVzb3VyY2VzID0gY3JlYXRlUmVzb3VyY2VSZWdpc3RyeShyZWdpc3RyeSk7XG4gICAgICAgIC8vIFQtVjI1LTQ6IHByb21wdHMgcmVnaXN0cnkgYmFrZWQgd2l0aCBwcm9qZWN0IGNvbnRleHQgdGhhdCdzXG4gICAgICAgIC8vIHJlc29sdmVkIGxhemlseSDigJQgRWRpdG9yLlByb2plY3QgbWF5IG5vdCBiZSByZWFkeSBhdCBNQ1BTZXJ2ZXJcbiAgICAgICAgLy8gY29uc3RydWN0aW9uIHRpbWUgYnV0IGlzIHJlbGlhYmx5IGF2YWlsYWJsZSB3aGVuIHByb21wdHMvZ2V0XG4gICAgICAgIC8vIGlzIGNhbGxlZC5cbiAgICAgICAgdGhpcy5wcm9tcHRzID0gY3JlYXRlUHJvbXB0UmVnaXN0cnkoKCkgPT4gKHtcbiAgICAgICAgICAgIHByb2plY3ROYW1lOiB0aGlzLnJlc29sdmVQcm9qZWN0TmFtZSgpLFxuICAgICAgICAgICAgcHJvamVjdFBhdGg6IHRoaXMucmVzb2x2ZVByb2plY3RQYXRoKCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2V0RGVidWdMb2dFbmFibGVkKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcbiAgICAgICAgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKHNldHRpbmdzLmVuYWJsZUVkaXRvckNvbnRleHRFdmFsID8/IGZhbHNlKTtcbiAgICAgICAgc2V0U2NlbmVMb2dDYXB0dXJlRW5hYmxlZChzZXR0aW5ncy5lbmFibGVTY2VuZUxvZ0NhcHR1cmUgPz8gdHJ1ZSk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gVXNpbmcgc2hhcmVkIHRvb2wgcmVnaXN0cnkgKCR7T2JqZWN0LmtleXMocmVnaXN0cnkpLmxlbmd0aH0gY2F0ZWdvcmllcylgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkU2RrU2VydmVyKHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+KTogU2VydmVyIHtcbiAgICAgICAgY29uc3Qgc2RrU2VydmVyID0gbmV3IFNlcnZlcihcbiAgICAgICAgICAgIHsgbmFtZTogU0VSVkVSX05BTUUsIHZlcnNpb246IFNFUlZFUl9WRVJTSU9OIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2xzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFQtVjI1LTMgKFQtUDMtMyk6IHN1YnNjcmliZSBpcyBub3cgdHJ1ZSDigJQgY2xpZW50cyBjYW5cbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb3VyY2VzL3N1YnNjcmliZSB0byBhIFVSSTsgdGhlIGJyb2FkY2FzdC1icmlkZ2VcbiAgICAgICAgICAgICAgICAgICAgLy8gcHVzaGVzIG5vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gbWFwcGVkIGNvY29zIGJyb2FkY2FzdCBmaXJlcyAoZGVib3VuY2VkIHBlciBVUkkpLlxuICAgICAgICAgICAgICAgICAgICAvLyBSRkMgNjU3MCB0ZW1wbGF0ZXMgYXJlIGltcGxpY2l0bHkgc3VwcG9ydGVkIGJ5IHJlZ2lzdGVyaW5nXG4gICAgICAgICAgICAgICAgICAgIC8vIExpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RTY2hlbWEgYmVsb3cg4oCUIE1DUCBzcGVjIGhhcyBub1xuICAgICAgICAgICAgICAgICAgICAvLyByZXNvdXJjZXMudGVtcGxhdGVzIGNhcGFiaWxpdHkgZmxhZyAoY29jb3MtY2xpJ3NcbiAgICAgICAgICAgICAgICAgICAgLy8gYHRlbXBsYXRlczogdHJ1ZWAgaXMgbm9uLXNwZWMgYW5kIHdvdWxkIGJlIHN0cmlwcGVkKS5cbiAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2VzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlLCBzdWJzY3JpYmU6IHRydWUgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gVC1WMjUtNCAoVC1QMy0yKTogNCBiYWtlZCBwcm9tcHQgdGVtcGxhdGVzOyBub1xuICAgICAgICAgICAgICAgICAgICAvLyBob3QtcmVsb2FkIHlldCBzbyBsaXN0Q2hhbmdlZCBzdGF5cyBmYWxzZS5cbiAgICAgICAgICAgICAgICAgICAgcHJvbXB0czogeyBsaXN0Q2hhbmdlZDogZmFsc2UgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLnRvb2xzTGlzdC5tYXAodCA9PiAoe1xuICAgICAgICAgICAgICAgIG5hbWU6IHQubmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBhbm5vdGF0aW9uczogdC5hbm5vdGF0aW9ucyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogdC5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoQ2FsbFRvb2xSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBuYW1lLCBhcmd1bWVudHM6IGFyZ3MgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChuYW1lLCBhcmdzID8/IHt9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5idWlsZFRvb2xSZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfV0sXG4gICAgICAgICAgICAgICAgICAgIGlzRXJyb3I6IHRydWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UmVzb3VyY2VzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHJlc291cmNlczogdGhpcy5yZXNvdXJjZXMubGlzdCgpLFxuICAgICAgICB9KSk7XG4gICAgICAgIHNka1NlcnZlci5zZXRSZXF1ZXN0SGFuZGxlcihMaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0U2NoZW1hLCBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgICAgcmVzb3VyY2VUZW1wbGF0ZXM6IHRoaXMucmVzb3VyY2VzLmxpc3RUZW1wbGF0ZXMoKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoUmVhZFJlc291cmNlUmVxdWVzdFNjaGVtYSwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgdXJpIH0gPSByZXF1ZXN0LnBhcmFtcztcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc291cmNlcy5yZWFkKHVyaSk7XG4gICAgICAgICAgICByZXR1cm4geyBjb250ZW50czogW2NvbnRlbnRdIH07XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBULVYyNS0zOiBwZXItc2Vzc2lvbiByZXNvdXJjZSBzdWJzY3JpcHRpb24gaGFuZGxlcnMuIFRoZVxuICAgICAgICAvLyBgc3Vic2NyaXB0aW9uc2AgU2V0IGlzIGNhcHR1cmVkIGF0IHNlc3Npb24tY3JlYXRpb24gdGltZSBhbmRcbiAgICAgICAgLy8gc2hhcmVkIHdpdGggdGhlIFNlc3Npb25FbnRyeSBzbyBgbm90aWZ5UmVzb3VyY2VVcGRhdGVkYFxuICAgICAgICAvLyBjYW4gaXRlcmF0ZSBzZXNzaW9ucyBhbmQgY2hlY2sgbWVtYmVyc2hpcCB3aXRob3V0IGEgc2Vjb25kXG4gICAgICAgIC8vIGxvb2t1cC5cbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKFN1YnNjcmliZVJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHVyaSB9ID0gcmVxdWVzdC5wYXJhbXM7XG4gICAgICAgICAgICBzdWJzY3JpcHRpb25zLmFkZCh1cmkpO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzdWJzY3JpYmUgJHt1cml9IChzZXNzaW9uIGFjdGl2ZSBzdWJzOiAke3N1YnNjcmlwdGlvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0pO1xuICAgICAgICBzZGtTZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoVW5zdWJzY3JpYmVSZXF1ZXN0U2NoZW1hLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1cmkgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgc3Vic2NyaXB0aW9ucy5kZWxldGUodXJpKTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gdW5zdWJzY3JpYmUgJHt1cml9IChzZXNzaW9uIGFjdGl2ZSBzdWJzOiAke3N1YnNjcmlwdGlvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBULVYyNS00OiBwcm9tcHRzL2xpc3QgKyBwcm9tcHRzL2dldC4gU3RhdGVsZXNzIChubyBzZXNzaW9uXG4gICAgICAgIC8vIGFmZmluaXR5IG5lZWRlZCk7IHJlbmRlcmVkIHRleHQgYmFrZXMgaW4gcHJvamVjdCBjb250ZXh0IGF0XG4gICAgICAgIC8vIGNhbGwgdGltZSBzbyBhIHByb2plY3QgcmVuYW1lIGlzIHJlZmxlY3RlZCBpbW1lZGlhdGVseS5cbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RQcm9tcHRzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICAgIHByb21wdHM6IHRoaXMucHJvbXB0cy5saXN0KCksXG4gICAgICAgIH0pKTtcbiAgICAgICAgc2RrU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKEdldFByb21wdFJlcXVlc3RTY2hlbWEsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IG5hbWUgfSA9IHJlcXVlc3QucGFyYW1zO1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMucHJvbXB0cy5nZXQobmFtZSk7XG4gICAgICAgICAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIPCfn6EpOiB1bmtub3duXG4gICAgICAgICAgICAgICAgLy8gcHJvbXB0IG5hbWVzIG11c3Qgc3VyZmFjZSBhcyBKU09OLVJQQyBlcnJvcnMgcGVyIE1DUCBzcGVjLFxuICAgICAgICAgICAgICAgIC8vIG5vdCBhcyBzdWNjZXNzZnVsIFwiUHJvbXB0IG5vdCBmb3VuZFwiIGNvbnRlbnQgYm9kaWVzLlxuICAgICAgICAgICAgICAgIC8vIFNESydzIFJlcXVlc3RIYW5kbGVyIGNvbnZlcnRzIHRocm93biBFcnJvcnMgaW50b1xuICAgICAgICAgICAgICAgIC8vIC0zMjYwMyBJbnRlcm5hbCBFcnJvciBieSBkZWZhdWx0OyB3ZSB0aHJvdyBhIHBsYWluIEVycm9yXG4gICAgICAgICAgICAgICAgLy8gd2l0aCBhIGhlbHBmdWwgbWVzc2FnZSBpbmNsdWRpbmcgdGhlIGF2YWlsYWJsZSBuYW1lcy5cbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcHJvbXB0OiAke25hbWV9LiBBdmFpbGFibGU6ICR7dGhpcy5wcm9tcHRzLmtub3duTmFtZXMoKS5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU0RLJ3MgR2V0UHJvbXB0UmVzdWx0IHR5cGUgY2FycmllcyBhIGRpc2NyaW1pbmF0ZWQgdW5pb25cbiAgICAgICAgICAgIC8vIChvbmUgYnJhbmNoIHJlcXVpcmVzIGEgYHRhc2tgIGZpZWxkKS4gT3VyIGNvbnRlbnQgbWF0Y2hlc1xuICAgICAgICAgICAgLy8gdGhlIHNpbXBsZS1wcm9tcHQgYnJhbmNoOyBjYXN0IHRocm91Z2ggdW5rbm93biB0byBzYXRpc2Z5XG4gICAgICAgICAgICAvLyB0aGUgc3RydWN0dXJhbCBjaGVjayB3aXRob3V0IGJ1eWluZyBpbnRvIHRoZSB0YXNrIGJyYW5jaC5cbiAgICAgICAgICAgIHJldHVybiBjb250ZW50IGFzIHVua25vd24gYXMgYW55O1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHNka1NlcnZlcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TmFtZSgpOiBzdHJpbmcge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGF0aCA9IChFZGl0b3IgYXMgYW55KT8uUHJvamVjdD8ucGF0aCBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAocGF0aCkge1xuICAgICAgICAgICAgICAgIC8vIExhc3QgcGF0aCBzZWdtZW50IHVzdWFsbHkgdGhlIHByb2plY3QgZm9sZGVyIG5hbWU7IGZhbGwgYmFja1xuICAgICAgICAgICAgICAgIC8vIHRvIFwiKHVua25vd24pXCIgaWYgRWRpdG9yIGlzbid0IHJlYWR5LlxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgvW1xcXFwvXS8pLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gPz8gJyh1bmtub3duKSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cbiAgICAgICAgcmV0dXJuICcodW5rbm93biknO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RQYXRoKCk6IHN0cmluZyB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gKEVkaXRvciBhcyBhbnkpPy5Qcm9qZWN0Py5wYXRoID8/ICcodW5rbm93biknO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuICcodW5rbm93biknOyB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVC1WMjUtMzogZGlzcGF0Y2ggYSBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkIHRvIGV2ZXJ5XG4gICAgICogc2Vzc2lvbiB0aGF0IHByZXZpb3VzbHkgY2FsbGVkIHJlc291cmNlcy9zdWJzY3JpYmUgb24gdGhpcyBVUkkuXG4gICAgICogQ2FsbGVkIGJ5IEJyb2FkY2FzdEJyaWRnZSBhZnRlciBpdHMgcGVyLVVSSSBkZWJvdW5jZSBmaXJlcy5cbiAgICAgKi9cbiAgICBwcml2YXRlIG5vdGlmeVJlc291cmNlVXBkYXRlZCh1cmk6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0KTogc2RrU2VydmVyLm5vdGlmaWNhdGlvbiguLi4pXG4gICAgICAgIC8vIHJldHVybnMgYSBQcm9taXNlLiBXaXRob3V0IGF3YWl0L2NhdGNoLCB0cmFuc3BvcnQtbGV2ZWwgZmFpbHVyZXNcbiAgICAgICAgLy8gYmVjb21lIHVuaGFuZGxlZCByZWplY3Rpb25zIChOb2RlIHByaW50cyBzY2FyeSBcIlVuaGFuZGxlZFByb21pc2VSZWplY3Rpb25cIlxuICAgICAgICAvLyBhbmQgbWF5IGV4aXQgb24gLS11bmhhbmRsZWQtcmVqZWN0aW9ucz1zdHJpY3QpLiBVc2Ugdm9pZCtjYXRjaCBzb1xuICAgICAgICAvLyB0aGUgbG9vcCBjb250aW51ZXMgZXZlbiBpZiBvbmUgc2Vzc2lvbidzIHRyYW5zcG9ydCBpcyBoYWxmLWNsb3NlZC5cbiAgICAgICAgLy8gU25hcHNob3Qgc2Vzc2lvbiBsaXN0IChjbGF1ZGUg8J+foSkgc28gYSBzZXNzaW9uIHJlbW92ZWQgbWlkLWl0ZXJhdGlvblxuICAgICAgICAvLyBkb2Vzbid0IHNrZXcgdGhlIHF1ZXVlZCBub3RpZmljYXRpb25zLlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gQXJyYXkuZnJvbSh0aGlzLnNlc3Npb25zLnZhbHVlcygpKS5maWx0ZXIocyA9PiBzLnN1YnNjcmlwdGlvbnMuaGFzKHVyaSkpO1xuICAgICAgICBpZiAodGFyZ2V0cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgIHZvaWQgc2Vzc2lvbi5zZGtTZXJ2ZXIubm90aWZpY2F0aW9uKHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHsgdXJpIH0sXG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIud2FybihgW01DUFNlcnZlcl0gbm90aWZpY2F0aW9uIHB1c2ggZmFpbGVkIGZvciAke3VyaX06YCwgZXJyPy5tZXNzYWdlID8/IGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHJlc291cmNlcy91cGRhdGVkICR7dXJpfSDihpIgJHt0YXJnZXRzLmxlbmd0aH0gc2Vzc2lvbihzKWApO1xuICAgIH1cblxuICAgIC8vIFQtUDEtNTogVG9vbFJlc3BvbnNlIOKGkiBNQ1AgQ2FsbFRvb2xSZXN1bHQuIEZhaWx1cmVzIGNhcnJ5IHRoZSBlcnJvclxuICAgIC8vIG1lc3NhZ2UgaW4gdGV4dCBjb250ZW50ICsgaXNFcnJvci4gU3VjY2Vzc2VzIGtlZXAgSlNPTi5zdHJpbmdpZnkocmVzdWx0KVxuICAgIC8vIGluIHRleHQgKGJhY2stY29tcGF0KSBhbmQgdGhlIHBhcnNlZCBvYmplY3QgaW4gc3RydWN0dXJlZENvbnRlbnQuXG4gICAgcHJpdmF0ZSBidWlsZFRvb2xSZXN1bHQocmVzdWx0OiBhbnkpIHtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IHJlc3VsdC5lcnJvciA/PyByZXN1bHQubWVzc2FnZSA/PyAnVG9vbCBmYWlsZWQnO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcgYXMgY29uc3QsIHRleHQ6IHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogSlNPTi5zdHJpbmdpZnkobXNnKSB9XSxcbiAgICAgICAgICAgICAgICBpc0Vycm9yOiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXh0ID0gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiBKU09OLnN0cmluZ2lmeShyZXN1bHQpO1xuICAgICAgICBjb25zdCBvdXQ6IHsgY29udGVudDogQXJyYXk8eyB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9Pjsgc3RydWN0dXJlZENvbnRlbnQ/OiBhbnkgfSA9IHtcbiAgICAgICAgICAgIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dCB9XSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgb3V0LnN0cnVjdHVyZWRDb250ZW50ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoJ1tNQ1BTZXJ2ZXJdIFNlcnZlciBpcyBhbHJlYWR5IHJ1bm5pbmcnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2V0dXBUb29scygpO1xuXG4gICAgICAgIGNvbnN0IHsgcG9ydCB9ID0gdGhpcy5zZXR0aW5ncztcbiAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIFN0YXJ0aW5nIEhUVFAgc2VydmVyIG9uIHBvcnQgJHtwb3J0fS4uLmApO1xuICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcih0aGlzLmhhbmRsZUh0dHBSZXF1ZXN0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciEubGlzdGVuKHBvcnQsICcxMjcuMC4wLjEnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIOKchSBIVFRQIHNlcnZlciBzdGFydGVkIG9uIGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fWApO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQU2VydmVyXSBIZWFsdGggY2hlY2s6IGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9oZWFsdGhgKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhgW01DUFNlcnZlcl0gTUNQIGVuZHBvaW50OiAgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L21jcGApO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5odHRwU2VydmVyIS5vbignZXJyb3InLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tNQ1BTZXJ2ZXJdIOKdjCBGYWlsZWQgdG8gc3RhcnQgc2VydmVyOicsIGVycik7XG4gICAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBbTUNQU2VydmVyXSBQb3J0ICR7cG9ydH0gaXMgYWxyZWFkeSBpbiB1c2UuIFBsZWFzZSBjaGFuZ2UgdGhlIHBvcnQgaW4gc2V0dGluZ3MuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHNldEludGVydmFsIGtlZXBzIHRoZSBOb2RlIGV2ZW50IGxvb3AgYWxpdmU7IHVucmVmIHNvIHdlIGRvbid0XG4gICAgICAgIC8vIGJsb2NrIGV4dGVuc2lvbiB0ZWFyZG93biBpZiBzdG9wKCkgc29tZWhvdyBkb2Vzbid0IHJ1bi5cbiAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLnN3ZWVwSWRsZVNlc3Npb25zKCksIFNFU1NJT05fQ0xFQU5VUF9JTlRFUlZBTF9NUyk7XG4gICAgICAgIHRoaXMuY2xlYW51cEludGVydmFsLnVucmVmPy4oKTtcblxuICAgICAgICAvLyBULVYyNS0zOiBzcGluIHVwIHRoZSBjb2NvcyBicm9hZGNhc3Qg4oaSIE1DUCBub3RpZmljYXRpb25zIGJyaWRnZS5cbiAgICAgICAgLy8gRGlzYWJsZWQgb3V0c2lkZSB0aGUgZWRpdG9yIGhvc3QgKGUuZy4gaGVhZGxlc3Mgc21va2UgcnVucylcbiAgICAgICAgLy8gYmVjYXVzZSBFZGl0b3IuTWVzc2FnZS5fX3Byb3RlY3RlZF9fIGlzbid0IGF2YWlsYWJsZSB0aGVyZTtcbiAgICAgICAgLy8gQnJvYWRjYXN0QnJpZGdlLnN0YXJ0KCkgZGV0ZWN0cyB0aGlzIGFuZCBsb2dzIGEgd2FybmluZy5cbiAgICAgICAgdGhpcy5icm9hZGNhc3RCcmlkZ2Uuc3RhcnQoKHVyaSkgPT4gdGhpcy5ub3RpZnlSZXNvdXJjZVVwZGF0ZWQodXJpKSk7XG5cbiAgICAgICAgbG9nZ2VyLmluZm8oYFtNQ1BTZXJ2ZXJdIPCfmoAgTUNQIFNlcnZlciByZWFkeSAoJHt0aGlzLnRvb2xzTGlzdC5sZW5ndGh9IHRvb2xzKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3dlZXBJZGxlU2Vzc2lvbnMoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25zLnNpemUgPT09IDApIHJldHVybjtcbiAgICAgICAgY29uc3QgY3V0b2ZmID0gRGF0ZS5ub3coKSAtIFNFU1NJT05fSURMRV9USU1FT1VUX01TO1xuICAgICAgICBjb25zdCBzdGFsZTogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBbaWQsIGVudHJ5XSBvZiB0aGlzLnNlc3Npb25zKSB7XG4gICAgICAgICAgICBpZiAoZW50cnkubGFzdEFjdGl2aXR5QXQgPCBjdXRvZmYpIHN0YWxlLnB1c2goaWQpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgaWQgb2Ygc3RhbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5zZXNzaW9ucy5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKCFlbnRyeSkgY29udGludWU7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICBlbnRyeS50cmFuc3BvcnQuY2xvc2UoKS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKGBbTUNQU2VydmVyXSBzd2VlcCBjbG9zZSBlcnJvciBmb3IgJHtpZH06YCwgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzd2VwdCBpZGxlIHNlc3Npb246ICR7aWR9IChyZW1haW5pbmc6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0dXBUb29scygpOiB2b2lkIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIG5ldyBsaXN0IGxvY2FsbHkgYW5kIG9ubHkgc3dhcCBvbmNlIGl0J3MgcmVhZHksIHNvIHRoYXRcbiAgICAgICAgLy8gYSBjb25jdXJyZW50IExpc3RUb29sc1JlcXVlc3QgY2FuIG5ldmVyIG9ic2VydmUgYW4gZW1wdHkgbGlzdC5cbiAgICAgICAgY29uc3QgZW5hYmxlZEZpbHRlciA9IHRoaXMuZW5hYmxlZFRvb2xzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gbmV3IFNldCh0aGlzLmVuYWJsZWRUb29scy5tYXAodCA9PiBgJHt0LmNhdGVnb3J5fV8ke3QubmFtZX1gKSlcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBjb25zdCBuZXh0OiBUb29sRGVmaW5pdGlvbltdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2NhdGVnb3J5LCB0b29sU2V0XSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnRvb2xzKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZxTmFtZSA9IGAke2NhdGVnb3J5fV8ke3Rvb2wubmFtZX1gO1xuICAgICAgICAgICAgICAgIGlmIChlbmFibGVkRmlsdGVyICYmICFlbmFibGVkRmlsdGVyLmhhcyhmcU5hbWUpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvLyBULVYyMy0xOiB0YWcgZXZlcnkgbm9uLXByaW1hcnkgdG9vbCBbc3BlY2lhbGlzdF0gc28gQUkgcHJlZmVyc1xuICAgICAgICAgICAgICAgIC8vIGV4ZWN1dGVfamF2YXNjcmlwdCBmb3IgY29tcG91bmQgb3BlcmF0aW9ucy4gVGhlIHR3byBleGVjdXRlXypcbiAgICAgICAgICAgICAgICAvLyB0b29scyBhbHJlYWR5IGNhcnJ5IHRoZWlyIG93biBbcHJpbWFyeV0vW2NvbXBhdF0gcHJlZml4IGluXG4gICAgICAgICAgICAgICAgLy8gdGhlaXIgZGVzY3JpcHRpb24gdGV4dCDigJQgbGVhdmUgdGhvc2UgYWxvbmUuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVzYyA9IHRvb2wuZGVzY3JpcHRpb247XG4gICAgICAgICAgICAgICAgY29uc3QgYWxyZWFkeVRhZ2dlZCA9IGRlc2Muc3RhcnRzV2l0aCgnW3ByaW1hcnldJykgfHwgZGVzYy5zdGFydHNXaXRoKCdbY29tcGF0XScpIHx8IGRlc2Muc3RhcnRzV2l0aCgnW3NwZWNpYWxpc3RdJyk7XG4gICAgICAgICAgICAgICAgbmV4dC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogZnFOYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYWxyZWFkeVRhZ2dlZCA/IGRlc2MgOiBgW3NwZWNpYWxpc3RdICR7ZGVzY31gLFxuICAgICAgICAgICAgICAgICAgICBhbm5vdGF0aW9uczogdG9vbC5hbm5vdGF0aW9ucyxcbiAgICAgICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvb2wuaW5wdXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b29sc0xpc3QgPSBuZXh0O1xuXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgW01DUFNlcnZlcl0gU2V0dXAgdG9vbHM6ICR7dGhpcy50b29sc0xpc3QubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVRvb2xDYWxsKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgICAgIGNvbnN0IFtjYXRlZ29yeSwgLi4ucmVzdF0gPSB0b29sTmFtZS5zcGxpdCgnXycpO1xuICAgICAgICBjb25zdCBleGVjdXRvciA9IHRoaXMudG9vbHNbY2F0ZWdvcnldO1xuICAgICAgICBpZiAoIWV4ZWN1dG9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJHt0b29sTmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGV4ZWN1dG9yLmV4ZWN1dGUocmVzdC5qb2luKCdfJyksIGFyZ3MpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBdmFpbGFibGVUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9vbHNMaXN0O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzOiBhbnlbXSk6IHZvaWQge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIFVwZGF0aW5nIGVuYWJsZWQgdG9vbHM6ICR7ZW5hYmxlZFRvb2xzLmxlbmd0aH0gdG9vbHNgKTtcbiAgICAgICAgdGhpcy5lbmFibGVkVG9vbHMgPSBlbmFibGVkVG9vbHM7XG4gICAgICAgIHRoaXMuc2V0dXBUb29scygpO1xuICAgICAgICAvLyBOb3RpZnkgYWxsIGxpdmUgc2Vzc2lvbnMgdGhhdCB0aGUgdG9vbCBsaXN0IGNoYW5nZWQuXG4gICAgICAgIGZvciAoY29uc3QgeyBzZGtTZXJ2ZXIgfSBvZiB0aGlzLnNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICAgICAgICBzZGtTZXJ2ZXIuc2VuZFRvb2xMaXN0Q2hhbmdlZCgpLmNhdGNoKCgpID0+IHsgLyogcGVlciBtYXkgaGF2ZSBkcm9wcGVkICovIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFNldHRpbmdzKCk6IE1DUFNlcnZlclNldHRpbmdzIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0dGluZ3M7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdHRwUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcGFyc2VkVXJsID0gdXJsLnBhcnNlKHJlcS51cmwgfHwgJycsIHRydWUpO1xuICAgICAgICBjb25zdCBwYXRobmFtZSA9IHBhcnNlZFVybC5wYXRobmFtZTtcblxuICAgICAgICAvLyAvaGVhbHRoIGlzIHRoZSBvbmx5IHJvdXRlIHNhZmUgdG8gc2VydmUgdW5kZXIgYW55IEhvc3QuIEFsbFxuICAgICAgICAvLyBtdXRhdGluZyAvIHByaXZpbGVnZWQgcm91dGVzIHJlcXVpcmUgYSBsb29wYmFjayBIb3N0IGhlYWRlciBzbyBhXG4gICAgICAgIC8vIEROUy1yZWJpbmRpbmcgYXR0YWNrZXIgcmVzb2x2aW5nIGF0dGFja2VyLmNvbSDihpIgMTI3LjAuMC4xIGNhbm5vdFxuICAgICAgICAvLyBkcml2ZSB0aGUgZWRpdG9yIGZyb20gYSB2aWN0aW0gYnJvd3NlciB0YWIuXG4gICAgICAgIGlmIChwYXRobmFtZSAhPT0gJy9oZWFsdGgnICYmICFpc0xvb3BiYWNrSG9zdChyZXEuaGVhZGVycy5ob3N0KSkge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ2hvc3Qgbm90IGFsbG93ZWQ7IGxvb3BiYWNrIG9ubHknIH0pKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENPUlMgaXMgd2lsZGNhcmQgc28gdGhlIENvY29zIENyZWF0b3IgcGFuZWwgd2VidmlldyAod2hpY2ggbG9hZHNcbiAgICAgICAgLy8gZnJvbSBhIGBmaWxlOi8vYCBvciBgZGV2dG9vbHM6Ly9gIG9yaWdpbikgY2FuIGhpdCB0aGlzIGVuZHBvaW50LlxuICAgICAgICAvLyBUaGUgc2VydmVyIG9ubHkgbGlzdGVucyBvbiAxMjcuMC4wLjEsIHNvIGV4dGVybmFsIGF0dGFja2VycyBjYW4ndFxuICAgICAgICAvLyByZWFjaCBpdDsgdGhlIHdpbGRjYXJkIGRvZXMgbWVhbiBhbnkgbG9jYWwgd2ViIHBhZ2UgaW4gdGhlIHVzZXInc1xuICAgICAgICAvLyBicm93c2VyIGNvdWxkIHByb2JlIGl0LCB3aGljaCBpcyBhY2NlcHRhYmxlIGZvciBhIGRldmVsb3BlciB0b29sLlxuICAgICAgICAvL1xuICAgICAgICAvLyBFWENFUFRJT046IC9nYW1lLyogZW5kcG9pbnRzIGFyZSBzY29wZWQgdG8gYSBzdHJpY3Qgb3JpZ2luXG4gICAgICAgIC8vIGFsbG93bGlzdCAodjIuNy4wICMyIGZpeCBvbiB2Mi42LjAgcmV2aWV3IFc3KS4gVGhlIHJlYXNvbmluZzpcbiAgICAgICAgLy8gL2dhbWUvcmVzdWx0IGlzIGEgd3JpdGUgZW5kcG9pbnQgdGhhdCBtdXRhdGVzIHRoZSBzaW5nbGUtZmxpZ2h0XG4gICAgICAgIC8vIHF1ZXVlIHN0YXRlIHNoYXJlZCBieSBBTEwgTUNQIHNlc3Npb25zIG9uIHRoaXMgaG9zdC4gQSBtYWxpY2lvdXNcbiAgICAgICAgLy8gbG9jYWwgYnJvd3NlciB0YWIgd2l0aCB0aGUgd2lsZGNhcmQgQ09SUyBjb3VsZCB0aW1lIGEgUE9TVCB0b1xuICAgICAgICAvLyByYWNlIGEgbGVnaXRpbWF0ZSBjb21tYW5kJ3MgcmVzdWx0LiAvZ2FtZS9jb21tYW5kIGFuZFxuICAgICAgICAvLyAvZ2FtZS9zdGF0dXMgYXJlIHJlYWRzIGJ1dCB0aGUgbGVnaXRpbWF0ZSBjYWxsZXIgKEdhbWVEZWJ1Z0NsaWVudFxuICAgICAgICAvLyBydW5uaW5nIGluc2lkZSBjb2NvcyBwcmV2aWV3IC8gYnJvd3NlciBwcmV2aWV3KSBpcyB3ZWxsLWtub3duLlxuICAgICAgICBjb25zdCBpc0dhbWVFbmRwb2ludCA9IHBhdGhuYW1lPy5zdGFydHNXaXRoKCcvZ2FtZS8nKSA9PT0gdHJ1ZTtcbiAgICAgICAgLy8gdjIuOC4wIFQtVjI4LTEgKGNhcnJ5b3ZlciBmcm9tIHYyLjcuMCBDbGF1ZGUgc2luZ2xlLXJldmlld2VyIPCfn6EpOlxuICAgICAgICAvLyBob2lzdCByZXNvbHZlR2FtZUNvcnNPcmlnaW4gc28gdGhlIE9QVElPTlMgYnJhbmNoLCB0aGUgcmVzcG9uc2UtXG4gICAgICAgIC8vIGhlYWRlciBicmFuY2gsIGFuZCB0aGUgcG9zdC1DT1JTIDQwMyBlbmZvcmNlbWVudCAobGF0ZXIgaW5cbiAgICAgICAgLy8gcmVxdWVzdEhhbmRsZXIpIHNoYXJlIG9uZSBjbGFzc2lmaWNhdGlvbiBjYWxsLlxuICAgICAgICBjb25zdCBnYW1lQWNhbyA9IGlzR2FtZUVuZHBvaW50XG4gICAgICAgICAgICA/IHJlc29sdmVHYW1lQ29yc09yaWdpbihyZXEuaGVhZGVycy5vcmlnaW4pXG4gICAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGlmIChpc0dhbWVFbmRwb2ludCkge1xuICAgICAgICAgICAgLy8gdjIuOC4wIFQtVjI4LTEgKGNhcnJ5b3ZlciBmcm9tIHYyLjcuMCBDbGF1ZGUgc2luZ2xlLXJldmlld2VyIPCfn6EpOlxuICAgICAgICAgICAgLy8gZW1pdCBWYXJ5OiBPcmlnaW4gb24gQk9USCBhbGxvdy0gYW5kIGRlbnktIGJyYW5jaGVzIHNvIGEgc2hhcmVkXG4gICAgICAgICAgICAvLyBicm93c2VyIGNhY2hlIGNhbm5vdCBzZXJ2ZSBhIGNhY2hlZCBhbGxvd2VkLW9yaWdpbiByZXNwb25zZSB0byBhXG4gICAgICAgICAgICAvLyBsYXRlciBkaXNhbGxvd2VkIG9yaWdpbiAob3IgdmljZSB2ZXJzYSkuIFRoZSBoZWFkZXIgaXMgc2V0IG9uY2VcbiAgICAgICAgICAgIC8vIGhlcmUgcmVnYXJkbGVzcyBvZiBhY2FvIG91dGNvbWUuXG4gICAgICAgICAgICBhcHBseUdhbWVDb3JzSGVhZGVycyhyZXEsIHJlcywgZ2FtZUFjYW8pO1xuICAgICAgICAgICAgLy8gUmVqZWN0IHByZWZsaWdodCBmcm9tIGRpc2FsbG93ZWQgb3JpZ2lucyBmYXN0IHNvIHRoZSByZXF1ZXN0XG4gICAgICAgICAgICAvLyBuZXZlciByZWFjaGVzIHRoZSBxdWV1ZSBsb2dpYy5cbiAgICAgICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHtcbiAgICAgICAgICAgICAgICBpZiAoZ2FtZUFjYW8gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDMpO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDQpO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDbGF1ZGUgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTpcbiAgICAgICAgICAgIC8vIGVtaXQgVmFyeTogT3JpZ2luIHVuaWZvcm1seSBhY3Jvc3MgYWxsIGJyYW5jaGVzIHNvIGEgZnV0dXJlXG4gICAgICAgICAgICAvLyBjaGFuZ2UgaW50cm9kdWNpbmcgZHluYW1pYyBBQ0FPIG9uIC9tY3AgY2FuJ3QgcXVpZXRseVxuICAgICAgICAgICAgLy8gcmVzdXJmYWNlIHRoZSBjYWNoZS1wb2lzb25pbmcgaXNzdWUgVC1WMjgtMSBqdXN0IGhhcmRlbmVkXG4gICAgICAgICAgICAvLyBhZ2FpbnN0IG9uIC9nYW1lLyouIENoZWFwIHRvIHNldDsgbmV2ZXIgaGFybWZ1bC5cbiAgICAgICAgICAgIGFwcGx5RGVmYXVsdENvcnNIZWFkZXJzKHJlcyk7XG5cbiAgICAgICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwNCk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvbWNwJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlTWNwUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2hlYWx0aCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIC8vIFQtVjI2LTE6IGluY2x1ZGUgR2FtZURlYnVnQ2xpZW50IGxpdmVuZXNzIHNvIEFJIC8gdXNlciBjYW5cbiAgICAgICAgICAgICAgICAvLyB2ZXJpZnkgdGhlIHBvbGxpbmcgY2xpZW50IGlzIHVwIGJlZm9yZSBpc3N1aW5nXG4gICAgICAgICAgICAgICAgLy8gZGVidWdfZ2FtZV9jb21tYW5kLlxuICAgICAgICAgICAgICAgIGNvbnN0IGdhbWVDbGllbnQgPSBnZXRDbGllbnRTdGF0dXMoKTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgICAgICAgICAgICAgICB0b29sczogdGhpcy50b29sc0xpc3QubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBnYW1lQ2xpZW50OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25uZWN0ZWQ6IGdhbWVDbGllbnQuY29ubmVjdGVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFBvbGxBdDogZ2FtZUNsaWVudC5sYXN0UG9sbEF0LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi43LjAgIzI6IGVuZm9yY2Ugb3JpZ2luIGFsbG93bGlzdCBmb3IgL2dhbWUvKiB3cml0ZXMgdG9vLlxuICAgICAgICAgICAgLy8gQnJvd3NlciBwcmVmbGlnaHQgaXMgYWxyZWFkeSBibG9ja2VkIChhYm92ZSkgYnV0IGEgbm9uLWJyb3dzZXJcbiAgICAgICAgICAgIC8vIGNsaWVudCAob3IgYSBicm93c2VyIHdpdGggc2ltcGxlLXJlcXVlc3QgYnlwYXNzKSBjYW4gc3RpbGxcbiAgICAgICAgICAgIC8vIFBPU1QvR0VULiBSZWplY3QgNDAzIGhlcmUgdG8gaGFyZGVuIHRoZSBxdWV1ZSBhZ2FpbnN0XG4gICAgICAgICAgICAvLyBjcm9zcy10YWIgaGlqYWNrLlxuICAgICAgICAgICAgLy8gdjIuOC4wIFQtVjI4LTE6IHJldXNlIHRoZSBhbHJlYWR5LWNsYXNzaWZpZWQgZ2FtZUFjYW8gaW5zdGVhZCBvZlxuICAgICAgICAgICAgLy8gcmUtcnVubmluZyByZXNvbHZlR2FtZUNvcnNPcmlnaW4gKGNoZWFwIGNhbGwgYnV0IGl0IGtlcHQgb3JpZ2luXG4gICAgICAgICAgICAvLyBjbGFzc2lmaWNhdGlvbiBsb2dpYyBpbiB0d28gcGxhY2VzKS5cbiAgICAgICAgICAgIGlmIChpc0dhbWVFbmRwb2ludCAmJiBnYW1lQWNhbyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAzLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdvcmlnaW4gbm90IGFsbG93ZWQgZm9yIC9nYW1lLyogZW5kcG9pbnRzJyB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVC1WMjYtMTogR2FtZURlYnVnQ2xpZW50IHBvbGxzIHRoaXMgZm9yIHRoZSBuZXh0IHBlbmRpbmcgY29tbWFuZC5cbiAgICAgICAgICAgIC8vIFNpbmdsZS1mbGlnaHQgcXVldWUgbGl2ZXMgaW4gbGliL2dhbWUtY29tbWFuZC1xdWV1ZS50cy5cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9nYW1lL2NvbW1hbmQnICYmIHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY21kID0gY29uc3VtZVBlbmRpbmdDb21tYW5kKCk7XG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KGNtZCA/PyBudWxsKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2dhbWUvcmVzdWx0JyAmJiByZXEubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgICAgICAgICBsZXQgcGFyc2VkOiBhbnk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgb2s6IGZhbHNlLCBlcnJvcjogYEludmFsaWQgSlNPTjogJHtlcnIubWVzc2FnZX1gIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY2xhdWRlIFcyKTogcmVxdWlyZSBib3RoIGlkIChzdHJpbmcpIGFuZFxuICAgICAgICAgICAgICAgIC8vIHN1Y2Nlc3MgKGJvb2xlYW4pLiBXaXRob3V0IHRoZSBzdWNjZXNzIGNoZWNrLCBhIGJ1Z2d5IGNsaWVudFxuICAgICAgICAgICAgICAgIC8vIHBvc3Rpbmcge2lkLCBlcnJvcn0gd291bGQgc2xpcCB0aHJvdWdoIGFuZCBkb3duc3RyZWFtIGNvZGVcbiAgICAgICAgICAgICAgICAvLyB3b3VsZCB0cmVhdCBzdWNjZXNzICE9PSBmYWxzZSBhcyB0cnV0aHkuXG4gICAgICAgICAgICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZC5pZCAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhcnNlZC5zdWNjZXNzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdleHBlY3RlZCB7aWQ6IHN0cmluZywgc3VjY2VzczogYm9vbGVhbiwgZGF0YT8sIGVycm9yP30nIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBhY2NlcHRlZCA9IHNldENvbW1hbmRSZXN1bHQocGFyc2VkKTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKGFjY2VwdGVkLm9rID8gMjA0IDogNDA5LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChhY2NlcHRlZC5vayA/ICcnIDogSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIGVycm9yOiBhY2NlcHRlZC5yZWFzb24gfSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9nYW1lL3N0YXR1cycgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoZ2V0Q2xpZW50U3RhdHVzKCkpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvYXBpL3Rvb2xzJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHRvb2xzOiB0aGlzLmdldFNpbXBsaWZpZWRUb29sc0xpc3QoKSB9KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lPy5zdGFydHNXaXRoKCcvYXBpLycpICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChyZXEsIHJlcywgcGF0aG5hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdOb3QgZm91bmQnIH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbTUNQU2VydmVyXSBIVFRQIHJlcXVlc3QgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgaWYgKCFyZXMuaGVhZGVyc1NlbnQpIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi42LjE6IDQxMyBzdXJmYWNlIGZvciBib2R5LWNhcCByZWplY3Rpb25zIHNvIGNsaWVudHNcbiAgICAgICAgICAgICAgICAvLyBjYW4gZGlzdGluZ3Vpc2ggXCJ5b3Ugc2VudCB0b28gbXVjaFwiIGZyb20gc2VydmVyIGZhdWx0cy5cbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBCb2R5VG9vTGFyZ2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQxMywgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJywgZGV0YWlsczogZXJyb3I/Lm1lc3NhZ2UgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSByZXEuaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gR0VUIChzZXJ2ZXItaW5pdGlhdGVkIFNTRSkgYW5kIERFTEVURSAoZXhwbGljaXQgc2Vzc2lvbiBjbG9zZSkgYm90aFxuICAgICAgICAvLyByZXF1aXJlIGFuIGV4aXN0aW5nIHNlc3Npb24uIFBlciBTdHJlYW1hYmxlIEhUVFAgc3BlYywgR0VUIHdpdGhvdXRcbiAgICAgICAgLy8gc2Vzc2lvbiBpcyBcIm1ldGhvZCBub3QgYWxsb3dlZFwiOyBERUxFVEUgd2l0aG91dCBzZXNzaW9uIGlzIFwibm90IGZvdW5kXCIuXG4gICAgICAgIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gc2Vzc2lvbklkID8gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghZW50cnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0dldCA9IHJlcS5tZXRob2QgPT09ICdHRVQnO1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoaXNHZXQgPyA0MDUgOiA0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsIGlzR2V0XG4gICAgICAgICAgICAgICAgICAgID8gJ01ldGhvZCBub3QgYWxsb3dlZCB3aXRob3V0IGFjdGl2ZSBzZXNzaW9uJ1xuICAgICAgICAgICAgICAgICAgICA6ICdTZXNzaW9uIG5vdCBmb3VuZCcpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbnRyeS5sYXN0QWN0aXZpdHlBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBlbnRyeS50cmFuc3BvcnQuaGFuZGxlUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQT1NUOiByZWFkIGJvZHkgb25jZSBzbyB3ZSBjYW4gZGV0ZWN0IGluaXRpYWxpemUgYmVmb3JlIGRpc3BhdGNoLlxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICAgICAgbGV0IHBhcnNlZEJvZHk6IGFueTtcbiAgICAgICAgaWYgKGJvZHkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwYXJzZWRCb2R5ID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChqc29uUnBjRXJyb3IoLTMyNzAwLFxuICAgICAgICAgICAgICAgICAgICBgUGFyc2UgZXJyb3I6ICR7cGFyc2VFcnJvci5tZXNzYWdlfS4gQm9keTogJHtib2R5LnN1YnN0cmluZygwLCAyMDApfWApKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZyA9IHNlc3Npb25JZCA/IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgZXhpc3RpbmcubGFzdEFjdGl2aXR5QXQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgZXhpc3RpbmcudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IHNlc3Npb24gbXVzdCBjb21lIHdpdGggYW4gaW5pdGlhbGl6ZSByZXF1ZXN0LlxuICAgICAgICBpZiAoIWlzSW5pdGlhbGl6ZVJlcXVlc3QocGFyc2VkQm9keSkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKGpzb25ScGNFcnJvcigtMzIwMDAsICdCYWQgUmVxdWVzdDogTm8gdmFsaWQgc2Vzc2lvbiBJRCBwcm92aWRlZCcpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBTZXJ2ZXIgZmlyc3Qgc28gdGhlIHRyYW5zcG9ydCBjYWxsYmFjayBjbG9zdXJlIGNhcHR1cmVzXG4gICAgICAgIC8vIGFuIGFscmVhZHktaW5pdGlhbGl6ZWQgYmluZGluZyAoYXZvaWRzIFREWi1zdHlsZSBvcmRlcmluZyBzdXJwcmlzZXMpLlxuICAgICAgICAvLyBULVYyNS0zOiBwcmUtY3JlYXRlIHRoZSBwZXItc2Vzc2lvbiBzdWJzY3JpcHRpb25zIFNldCBhbmQgcGFzcyBpdFxuICAgICAgICAvLyBpbnRvIGJ1aWxkU2RrU2VydmVyIHNvIHRoZSBTdWJzY3JpYmUvVW5zdWJzY3JpYmUgaGFuZGxlcnMgYW5kIHRoZVxuICAgICAgICAvLyBTZXNzaW9uRW50cnkgYm90aCByZWZlcmVuY2UgdGhlIHNhbWUgU2V0IGluc3RhbmNlLlxuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICAgIGNvbnN0IHNka1NlcnZlciA9IHRoaXMuYnVpbGRTZGtTZXJ2ZXIoc3Vic2NyaXB0aW9ucyk7XG4gICAgICAgIGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCh7XG4gICAgICAgICAgICBzZXNzaW9uSWRHZW5lcmF0b3I6ICgpID0+IHJhbmRvbVVVSUQoKSxcbiAgICAgICAgICAgIGVuYWJsZUpzb25SZXNwb25zZTogdHJ1ZSxcbiAgICAgICAgICAgIG9uc2Vzc2lvbmluaXRpYWxpemVkOiAoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb25zLnNldChpZCwgeyB0cmFuc3BvcnQsIHNka1NlcnZlciwgbGFzdEFjdGl2aXR5QXQ6IERhdGUubm93KCksIHN1YnNjcmlwdGlvbnMgfSk7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTUNQU2VydmVyXSBzZXNzaW9uIGluaXRpYWxpemVkOiAke2lkfSAodG90YWw6ICR7dGhpcy5zZXNzaW9ucy5zaXplfSlgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbnNlc3Npb25jbG9zZWQ6IChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNQ1BTZXJ2ZXJdIHNlc3Npb24gY2xvc2VkOiAke2lkfSAocmVtYWluaW5nOiAke3RoaXMuc2Vzc2lvbnMuc2l6ZX0pYCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgYXdhaXQgc2RrU2VydmVyLmNvbm5lY3QodHJhbnNwb3J0KTtcbiAgICAgICAgYXdhaXQgdHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAodGhpcy5jbGVhbnVwSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5jbGVhbnVwSW50ZXJ2YWwpO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwSW50ZXJ2YWwgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIC8vIFQtVjI1LTM6IHRlYXIgZG93biB0aGUgYnJpZGdlIGJlZm9yZSBjbG9zaW5nIHNlc3Npb25zIHNvIGFueVxuICAgICAgICAvLyBpbi1mbGlnaHQgbm90aWZpY2F0aW9uIHRpbWVycyBhcmUgY2xlYXJlZCBhbmQgbm8gbGlzdGVuZXJzXG4gICAgICAgIC8vIHRyeSB0byBwdXNoIHRvIGNsb3NlZCB0cmFuc3BvcnRzLlxuICAgICAgICB0aGlzLmJyb2FkY2FzdEJyaWRnZS5zdG9wKCk7XG4gICAgICAgIGZvciAoY29uc3QgeyB0cmFuc3BvcnQgfSBvZiB0aGlzLnNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRyYW5zcG9ydC5jbG9zZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQU2VydmVyXSB0cmFuc3BvcnQgY2xvc2UgZXJyb3I6JywgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9ucy5jbGVhcigpO1xuICAgICAgICBpZiAodGhpcy5odHRwU2VydmVyKSB7XG4gICAgICAgICAgICAvLyBjbG9zZSgpIG9ubHkgcmVmdXNlcyBORVcgY29ubmVjdGlvbnM7IGtlZXAtYWxpdmUgc29ja2V0cyBzdGF5XG4gICAgICAgICAgICAvLyBvcGVuIGFuZCB3b3VsZCBibG9jayBjbG9zZSgpIGZvcmV2ZXIuIEZvcmNlIHRoZW0gdG8gZHJvcCB0b28uXG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucz8uKCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIhLmNsb3NlKCgpID0+IHJlc29sdmUoKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IG51bGw7XG4gICAgICAgICAgICBsb2dnZXIuaW5mbygnW01DUFNlcnZlcl0gSFRUUCBzZXJ2ZXIgc3RvcHBlZCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFN0YXR1cygpOiBTZXJ2ZXJTdGF0dXMge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcnVubmluZzogISF0aGlzLmh0dHBTZXJ2ZXIsXG4gICAgICAgICAgICBwb3J0OiB0aGlzLnNldHRpbmdzLnBvcnQsXG4gICAgICAgICAgICBjbGllbnRzOiB0aGlzLnNlc3Npb25zLnNpemUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVTaW1wbGVBUElSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcGF0aG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBwYXRoUGFydHMgPSBwYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihwID0+IHApO1xuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIEFQSSBwYXRoLiBVc2UgL2FwaS97Y2F0ZWdvcnl9L3t0b29sX25hbWV9JyB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbFRvb2xOYW1lID0gYCR7cGF0aFBhcnRzWzFdfV8ke3BhdGhQYXJ0c1syXX1gO1xuXG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBsZXQgcGFyYW1zOiBhbnk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwYXJhbXMgPSBib2R5ID8gSlNPTi5wYXJzZShib2R5KSA6IHt9O1xuICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBlcnJvcjogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICAgICAgICAgIGRldGFpbHM6IHBhcnNlRXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZEJvZHk6IGJvZHkuc3Vic3RyaW5nKDAsIDIwMCksXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leGVjdXRlVG9vbENhbGwoZnVsbFRvb2xOYW1lLCBwYXJhbXMpO1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCB0b29sOiBmdWxsVG9vbE5hbWUsIHJlc3VsdCB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW01DUFNlcnZlcl0gU2ltcGxlIEFQSSBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgdG9vbDogcGF0aG5hbWUgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTaW1wbGlmaWVkVG9vbHNMaXN0KCk6IGFueVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9vbHNMaXN0Lm1hcCh0b29sID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gdG9vbC5uYW1lLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHBhcnRzWzBdO1xuICAgICAgICAgICAgY29uc3QgdG9vbE5hbWUgPSBwYXJ0cy5zbGljZSgxKS5qb2luKCdfJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICB0b29sTmFtZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgICAgICBhcGlQYXRoOiBgL2FwaS8ke2NhdGVnb3J5fS8ke3Rvb2xOYW1lfWAsXG4gICAgICAgICAgICAgICAgY3VybEV4YW1wbGU6IHRoaXMuZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeSwgdG9vbE5hbWUsIHRvb2wuaW5wdXRTY2hlbWEpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZUN1cmxFeGFtcGxlKGNhdGVnb3J5OiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIHNjaGVtYTogYW55KTogc3RyaW5nIHtcbiAgICAgICAgY29uc3Qgc2FtcGxlUGFyYW1zID0gdGhpcy5nZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWEpO1xuICAgICAgICBjb25zdCBqc29uU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2FtcGxlUGFyYW1zLCBudWxsLCAyKTtcbiAgICAgICAgcmV0dXJuIGBjdXJsIC1YIFBPU1QgaHR0cDovLzEyNy4wLjAuMToke3RoaXMuc2V0dGluZ3MucG9ydH0vYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9IFxcXFxcbiAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxcXG4gIC1kICcke2pzb25TdHJpbmd9J2A7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWE6IGFueSk6IGFueSB7XG4gICAgICAgIGlmICghc2NoZW1hIHx8ICFzY2hlbWEucHJvcGVydGllcykgcmV0dXJuIHt9O1xuICAgICAgICBjb25zdCBzYW1wbGU6IGFueSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzIGFzIGFueSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BTY2hlbWEgPSBwcm9wIGFzIGFueTtcbiAgICAgICAgICAgIHN3aXRjaCAocHJvcFNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gJ2V4YW1wbGVfc3RyaW5nJztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQgPz8gNDI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3BTY2hlbWEuZGVmYXVsdCA/PyB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlW2tleV0gPSAnZXhhbXBsZV92YWx1ZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNhbXBsZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLnVwZGF0aW5nKSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUFNlcnZlcl0gdXBkYXRlU2V0dGluZ3MgaWdub3JlZCDigJQgYW5vdGhlciB1cGRhdGUgaW4gcHJvZ3Jlc3MnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgICAgIHNldERlYnVnTG9nRW5hYmxlZChzZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyk7XG4gICAgICAgICAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogcGFuZWwgdG9nZ2xlcyBmb3IgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWwgbXVzdFxuICAgICAgICAgICAgLy8gdGFrZSBlZmZlY3QgaW1tZWRpYXRlbHkuIFdpdGhvdXQgdGhpcyByZS1hcHBseSwgZGlzYWJsaW5nIHRoZVxuICAgICAgICAgICAgLy8gc2V0dGluZyBhZnRlciBlbmFibGUgd291bGQgbGVhdmUgdGhlIHJ1bnRpbWUgZmxhZyBPTiB1bnRpbCB0aGVcbiAgICAgICAgICAgIC8vIGVudGlyZSBleHRlbnNpb24gcmVsb2FkcyDigJQgYSBzZWN1cml0eS1yZWxldmFudCBnYXAgYmVjYXVzZSB0aGVcbiAgICAgICAgICAgIC8vIGVkaXRvci1jb250ZXh0IGV2YWwgd291bGQga2VlcCBhY2NlcHRpbmcgQUktZ2VuZXJhdGVkIGhvc3Qtc2lkZVxuICAgICAgICAgICAgLy8gY29kZSBkZXNwaXRlIHRoZSB1c2VyJ3MgcGFuZWwgY2hvaWNlLlxuICAgICAgICAgICAgc2V0RWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKHNldHRpbmdzLmVuYWJsZUVkaXRvckNvbnRleHRFdmFsID8/IGZhbHNlKTtcbiAgICAgICAgICAgIC8vIHYyLjQuOCBBMzogcmUtYXBwbHkgc2NlbmUtbG9nLWNhcHR1cmUgZmxhZyBvbiBldmVyeSBzZXR0aW5nc1xuICAgICAgICAgICAgLy8gY2hhbmdlIHNvIHBhbmVsIHRvZ2dsZSB0YWtlcyBlZmZlY3QgaW1tZWRpYXRlbHksIG1pcnJvcmluZyB0aGVcbiAgICAgICAgICAgIC8vIGVkaXRvckNvbnRleHRFdmFsIHJlLWFwcGx5IHBhdHRlcm4uXG4gICAgICAgICAgICBzZXRTY2VuZUxvZ0NhcHR1cmVFbmFibGVkKHNldHRpbmdzLmVuYWJsZVNjZW5lTG9nQ2FwdHVyZSA/PyB0cnVlKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0aW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIHYyLjcuMCAjMiAoVzcgZnJvbSB2Mi42LjAgcmV2aWV3KTogcmVzb2x2ZSB0aGUgQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXG4vLyBoZWFkZXIgdmFsdWUgZm9yIC9nYW1lLyogZW5kcG9pbnRzLiBSZXR1cm5zOlxuLy8gICAtIHRoZSBlY2hvJ2Qgb3JpZ2luIHN0cmluZyB3aGVuIHRoZSBvcmlnaW4gaXMgaW4gb3VyIHRydXN0IGxpc3Rcbi8vICAgLSB0aGUgbGl0ZXJhbCAnbnVsbCcgc3RyaW5nIHdoZW4gdGhlIHJlcXVlc3QgaGFzIE9yaWdpbjogbnVsbCAoZmlsZTovL1xuLy8gICAgIFVSTHMgc2VuZCB0aGlzOyBjb2NvcyBQSUUgd2VidmlldyBvZnRlbiBydW5zIGZyb20gZmlsZTovLylcbi8vICAgLSB0aGUgd2lsZGNhcmQgJyonIGZvciBuby1PcmlnaW4gcmVxdWVzdHMgKGN1cmwvTm9kZSBjbGllbnRzLCBzYW1lLVxuLy8gICAgIG9yaWdpbiByZXF1ZXN0cyB0aGF0IGRvbid0IHNlbmQgT3JpZ2luKSDigJQgQ09SUyBvbmx5IG1hdHRlcnMgaW5cbi8vICAgICBicm93c2VycywgYW5kIHNhbWUtb3JpZ2luIC8gbm8tT3JpZ2luIHBhdGhzIGNhbid0IGJlIGNyb3NzLXRhYlxuLy8gICAgIGF0dGFja2Vyc1xuLy8gICAtIG51bGwgKHRoZSBKUyB2YWx1ZSkgd2hlbiB0aGUgb3JpZ2luIGlzIGRpc2FsbG93ZWQg4oaSIGNhbGxlciBvbWl0cyB0aGVcbi8vICAgICBBQ0FPIGhlYWRlciBzbyBicm93c2VycyBibG9jayB0aGUgcmVzcG9uc2VcbmZ1bmN0aW9uIHJlc29sdmVHYW1lQ29yc09yaWdpbihvcmlnaW46IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChDb2RleCDwn5+hICsgR2VtaW5pIPCfn6EpOiBub2RlIGh0dHAgYWxsb3dzIGR1cGxpY2F0ZVxuICAgIC8vIE9yaWdpbiBoZWFkZXJzLCB3aGljaCBwcm9kdWNlcyBhIHN0cmluZ1tdIGhlcmUuIFdIQVRXRyBVUkwgd291bGRcbiAgICAvLyBzZXJpYWxpemUgdGhhdCB0byBcImEsYlwiIGFuZCBlaXRoZXIgdGhyb3cgb3IgbWlzLWNsYXNzaWZ5LiBUcmVhdCBhc1xuICAgIC8vIGRpc2FsbG93ZWQg4oCUIGEgbGVnaXRpbWF0ZSBicm93c2VyIHNlbmRzIGV4YWN0bHkgb25lIE9yaWdpbi5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShvcmlnaW4pKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAob3JpZ2luID09PSB1bmRlZmluZWQgfHwgb3JpZ2luID09PSAnJykge1xuICAgICAgICAvLyBObyBPcmlnaW4gaGVhZGVyIOKGkiBub3QgYSBicm93c2VyIGZldGNoLiBBbGxvdy5cbiAgICAgICAgcmV0dXJuICcqJztcbiAgICB9XG4gICAgaWYgKG9yaWdpbiA9PT0gJ251bGwnKSB7XG4gICAgICAgIC8vIGZpbGU6Ly8gcGFnZXMgYW5kIHNvbWUgc2FuZGJveGVkIGlmcmFtZXMgc2VuZCAnbnVsbCcuIEFsbG93OlxuICAgICAgICAvLyBjb2NvcyBQSUUgd2VidmlldyBvZnRlbiBmYWxscyBpbnRvIHRoaXMgYnVja2V0LlxuICAgICAgICByZXR1cm4gJ251bGwnO1xuICAgIH1cbiAgICAvLyBBbGxvdyBsb29wYmFjayBIVFRQIG9yaWdpbnMgKGNvY29zIGJyb3dzZXIgcHJldmlldyBhdFxuICAgIC8vIGh0dHA6Ly9sb2NhbGhvc3Q6NzQ1NiBldGMuKSBhbmQgZGV2dG9vbHMvZmlsZSBzY2hlbWVzLlxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHUgPSBuZXcgVVJMKG9yaWdpbik7XG4gICAgICAgIGlmICh1LnByb3RvY29sID09PSAnZmlsZTonIHx8IHUucHJvdG9jb2wgPT09ICdkZXZ0b29sczonKSByZXR1cm4gb3JpZ2luO1xuICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY2xhdWRlIPCfn6EgKyBnZW1pbmkg8J+UtCk6IFdIQVRXRyBVUkwga2VlcHNcbiAgICAgICAgLy8gYnJhY2tldHMgYXJvdW5kIElQdjYgaG9zdG5hbWVzIG9uIE5vZGUgMTgrLCBidXQgb2xkZXIgYnVuZGxlZFxuICAgICAgICAvLyBOb2RlIGJ1aWxkcyBtYXkgc3RyaXAgdGhlbSDigJQgYWNjZXB0IGJvdGggdG8gYmUgcG9ydGFibGUgYWNyb3NzXG4gICAgICAgIC8vIHdoYXRldmVyIE5vZGUgdGhlIGNvY29zIGVkaXRvciBzaGlwcyBhdCBhbnkgZ2l2ZW4gdmVyc2lvbi5cbiAgICAgICAgaWYgKCh1LnByb3RvY29sID09PSAnaHR0cDonIHx8IHUucHJvdG9jb2wgPT09ICdodHRwczonKVxuICAgICAgICAgICAgJiYgKHUuaG9zdG5hbWUgPT09ICdsb2NhbGhvc3QnIHx8IHUuaG9zdG5hbWUgPT09ICcxMjcuMC4wLjEnXG4gICAgICAgICAgICAgICAgfHwgdS5ob3N0bmFtZSA9PT0gJ1s6OjFdJyB8fCB1Lmhvc3RuYW1lID09PSAnOjoxJykpIHtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW47XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTWFsZm9ybWVkIE9yaWdpbiBoZWFkZXIg4oaSIHJlamVjdC5cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8vIHYyLjYuMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIFcxKTogY2FwIHJlcXVlc3QgYm9kaWVzIGF0IDMyIE1CLlxuLy8gU2NyZWVuc2hvdHMgY29tZSBiYWNrIGFzIGRhdGEgVVJMcyB0aGF0IGNhbiBsZWdpdGltYXRlbHkgYmUgYSBmZXcgTUIgb25cbi8vIDRrIGNhbnZhc2VzLCBzbyB3ZSBzZXQgdGhlIGNhcCBnZW5lcm91c2x5IHJhdGhlciB0aGFuIHBlci1lbmRwb2ludC5cbi8vIEFib3ZlIHRoZSBjYXAgd2UgZGVzdHJveSB0aGUgY29ubmVjdGlvbiBzbyB0aGUgY2xpZW50IHNlZXMgYSBoYXJkIGNsb3NlXG4vLyByYXRoZXIgdGhhbiBhIHNsb3cgdHJ1dGhmdWwgNDEzIChhdm9pZHMgdGhlbSBjb250aW51aW5nIHRvIHN0cmVhbSkuXG4vLyB2Mi45LjUgcmV2aWV3IGZpeCAoR2VtaW5pIPCfn6EgKyBDb2RleCDwn5+hKTogYnVtcGVkIDMyIOKGkiA2NCBNQiBzb1xuLy8gTWVkaWFSZWNvcmRlciBvdXRwdXQgYXQgaGlnaCBiaXRyYXRlcyAoNS0yMCBNYnBzIMOXIDMwLTYwcyA9IDE4LTE1MCBNQilcbi8vIGhhcyBtb3JlIGhlYWRyb29tIGJlZm9yZSB0aGUgdHJhbnNwb3J0IGxheWVyIDQxM3MuIFRoZSBob3N0LXNpZGVcbi8vIE1BWF9HQU1FX1JFQ09SRElOR19CWVRFUyBpbiBkZWJ1Zy10b29scy50cyBpcyBoZWxkIGlkZW50aWNhbCBzbyBib3RoXG4vLyBjYXBzIG1vdmUgdG9nZXRoZXI7IGxvd2VyIG9uZSB0byBkaWFsIGJhY2sgaWYgbWVtb3J5IHByZXNzdXJlIGJlY29tZXNcbi8vIGEgY29uY2Vybi5cbmNvbnN0IE1BWF9SRVFVRVNUX0JPRFlfQllURVMgPSA2NCAqIDEwMjQgKiAxMDI0O1xuXG5jbGFzcyBCb2R5VG9vTGFyZ2VFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICByZWFkb25seSBzdGF0dXNDb2RlID0gNDEzO1xuICAgIGNvbnN0cnVjdG9yKCkgeyBzdXBlcihgUmVxdWVzdCBib2R5IGV4Y2VlZHMgJHtNQVhfUkVRVUVTVF9CT0RZX0JZVEVTfSBieXRlc2ApOyB9XG59XG5cbmZ1bmN0aW9uIHJlYWRCb2R5KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcbiAgICAgICAgbGV0IHRvdGFsID0gMDtcbiAgICAgICAgcmVxLm9uKCdkYXRhJywgKGNodW5rOiBCdWZmZXIpID0+IHtcbiAgICAgICAgICAgIHRvdGFsICs9IGNodW5rLmxlbmd0aDtcbiAgICAgICAgICAgIGlmICh0b3RhbCA+IE1BWF9SRVFVRVNUX0JPRFlfQllURVMpIHtcbiAgICAgICAgICAgICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgQm9keVRvb0xhcmdlRXJyb3IoKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2h1bmtzLnB1c2goY2h1bmspO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVxLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpKSk7XG4gICAgICAgIHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuICAgIH0pO1xufVxuIl19