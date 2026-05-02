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
    SubscribeRequestSchema,
    UnsubscribeRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerSettings, ServerStatus, ToolDefinition } from './types';
import { setDebugLogEnabled, logger } from './lib/log';
import { setEditorContextEvalEnabled, setSceneLogCaptureEnabled } from './lib/runtime-flags';
import { ToolRegistry } from './tools/registry';
import { ResourceRegistry, createResourceRegistry } from './resources/registry';
import { BroadcastBridge } from './lib/broadcast-bridge';
import { PromptRegistry, createPromptRegistry } from './prompts/registry';
import {
    consumePendingCommand,
    setCommandResult,
    getClientStatus,
} from './lib/game-command-queue';

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

interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    sdkServer: Server;
    lastActivityAt: number;
    // T-V25-3: per-session resource URI subscriptions for
    // notifications/resources/updated push. Empty set → session
    // gets no notifications even if the bridge fires.
    subscriptions: Set<string>;
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
    private prompts: PromptRegistry;
    private toolsList: ToolDefinition[] = [];
    private enabledTools: any[] = [];
    private cleanupInterval: NodeJS.Timeout | null = null;
    private updating: boolean = false;
    // T-V25-3: bridge cocos editor IPC broadcasts → MCP
    // notifications/resources/updated. start()/stop() lifecycle
    // tied to the HTTP server.
    private broadcastBridge: BroadcastBridge = new BroadcastBridge();

    constructor(settings: MCPServerSettings, registry: ToolRegistry) {
        this.settings = settings;
        this.tools = registry;
        this.resources = createResourceRegistry(registry);
        // T-V25-4: prompts registry baked with project context that's
        // resolved lazily — Editor.Project may not be ready at MCPServer
        // construction time but is reliably available when prompts/get
        // is called.
        this.prompts = createPromptRegistry(() => ({
            projectName: this.resolveProjectName(),
            projectPath: this.resolveProjectPath(),
        }));
        setDebugLogEnabled(settings.enableDebugLog);
        setEditorContextEvalEnabled(settings.enableEditorContextEval ?? false);
        setSceneLogCaptureEnabled(settings.enableSceneLogCapture ?? true);
        logger.debug(`[MCPServer] Using shared tool registry (${Object.keys(registry).length} categories)`);
    }

    private buildSdkServer(subscriptions: Set<string>): Server {
        const sdkServer = new Server(
            { name: SERVER_NAME, version: SERVER_VERSION },
            {
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
        // T-V25-3: per-session resource subscription handlers. The
        // `subscriptions` Set is captured at session-creation time and
        // shared with the SessionEntry so `notifyResourceUpdated`
        // can iterate sessions and check membership without a second
        // lookup.
        sdkServer.setRequestHandler(SubscribeRequestSchema, async (request) => {
            const { uri } = request.params;
            subscriptions.add(uri);
            logger.debug(`[MCPServer] subscribe ${uri} (session active subs: ${subscriptions.size})`);
            return {};
        });
        sdkServer.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
            const { uri } = request.params;
            subscriptions.delete(uri);
            logger.debug(`[MCPServer] unsubscribe ${uri} (session active subs: ${subscriptions.size})`);
            return {};
        });
        // T-V25-4: prompts/list + prompts/get. Stateless (no session
        // affinity needed); rendered text bakes in project context at
        // call time so a project rename is reflected immediately.
        sdkServer.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: this.prompts.list(),
        }));
        sdkServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
            return content as unknown as any;
        });
        return sdkServer;
    }

    private resolveProjectName(): string {
        try {
            const path = (Editor as any)?.Project?.path as string | undefined;
            if (path) {
                // Last path segment usually the project folder name; fall back
                // to "(unknown)" if Editor isn't ready.
                const parts = path.split(/[\\/]/).filter(Boolean);
                return parts[parts.length - 1] ?? '(unknown)';
            }
        } catch { /* swallow */ }
        return '(unknown)';
    }

    private resolveProjectPath(): string {
        try {
            return (Editor as any)?.Project?.path ?? '(unknown)';
        } catch { return '(unknown)'; }
    }

    /**
     * T-V25-3: dispatch a notifications/resources/updated to every
     * session that previously called resources/subscribe on this URI.
     * Called by BroadcastBridge after its per-URI debounce fires.
     */
    private notifyResourceUpdated(uri: string): void {
        // v2.5.1 round-1 review fix (codex 🔴): sdkServer.notification(...)
        // returns a Promise. Without await/catch, transport-level failures
        // become unhandled rejections (Node prints scary "UnhandledPromiseRejection"
        // and may exit on --unhandled-rejections=strict). Use void+catch so
        // the loop continues even if one session's transport is half-closed.
        // Snapshot session list (claude 🟡) so a session removed mid-iteration
        // doesn't skew the queued notifications.
        const targets = Array.from(this.sessions.values()).filter(s => s.subscriptions.has(uri));
        if (targets.length === 0) return;
        for (const session of targets) {
            void session.sdkServer.notification({
                method: 'notifications/resources/updated',
                params: { uri },
            }).catch((err: any) => {
                logger.warn(`[MCPServer] notification push failed for ${uri}:`, err?.message ?? err);
            });
        }
        logger.debug(`[MCPServer] resources/updated ${uri} → ${targets.length} session(s)`);
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

        // T-V25-3: spin up the cocos broadcast → MCP notifications bridge.
        // Disabled outside the editor host (e.g. headless smoke runs)
        // because Editor.Message.__protected__ isn't available there;
        // BroadcastBridge.start() detects this and logs a warning.
        this.broadcastBridge.start((uri) => this.notifyResourceUpdated(uri));

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
        //
        // EXCEPTION: /game/* endpoints are scoped to a strict origin
        // allowlist (v2.7.0 #2 fix on v2.6.0 review W7). The reasoning:
        // /game/result is a write endpoint that mutates the single-flight
        // queue state shared by ALL MCP sessions on this host. A malicious
        // local browser tab with the wildcard CORS could time a POST to
        // race a legitimate command's result. /game/command and
        // /game/status are reads but the legitimate caller (GameDebugClient
        // running inside cocos preview / browser preview) is well-known.
        const isGameEndpoint = pathname?.startsWith('/game/') === true;
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
        } else {
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
                const gameClient = getClientStatus();
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
                const cmd = consumePendingCommand();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cmd ?? null));
                return;
            }
            if (pathname === '/game/result' && req.method === 'POST') {
                const body = await readBody(req);
                let parsed: any;
                try {
                    parsed = JSON.parse(body);
                } catch (err: any) {
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
                const accepted = setCommandResult(parsed);
                res.writeHead(accepted.ok ? 204 : 409, { 'Content-Type': 'application/json' });
                res.end(accepted.ok ? '' : JSON.stringify({ ok: false, error: accepted.reason }));
                return;
            }
            if (pathname === '/game/status' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(getClientStatus()));
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
                // v2.6.1: 413 surface for body-cap rejections so clients
                // can distinguish "you sent too much" from server faults.
                if (error instanceof BodyTooLargeError) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                }
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
        // T-V25-3: pre-create the per-session subscriptions Set and pass it
        // into buildSdkServer so the Subscribe/Unsubscribe handlers and the
        // SessionEntry both reference the same Set instance.
        const subscriptions = new Set<string>();
        const sdkServer = this.buildSdkServer(subscriptions);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
                this.sessions.set(id, { transport, sdkServer, lastActivityAt: Date.now(), subscriptions });
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
        // T-V25-3: tear down the bridge before closing sessions so any
        // in-flight notification timers are cleared and no listeners
        // try to push to closed transports.
        this.broadcastBridge.stop();
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
function resolveGameCorsOrigin(origin: string | string[] | undefined): string | null {
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
        if (u.protocol === 'file:' || u.protocol === 'devtools:') return origin;
        // v2.7.1 review fix (claude 🟡 + gemini 🔴): WHATWG URL keeps
        // brackets around IPv6 hostnames on Node 18+, but older bundled
        // Node builds may strip them — accept both to be portable across
        // whatever Node the cocos editor ships at any given version.
        if ((u.protocol === 'http:' || u.protocol === 'https:')
            && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'
                || u.hostname === '[::1]' || u.hostname === '::1')) {
            return origin;
        }
    } catch {
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
    readonly statusCode = 413;
    constructor() { super(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`); }
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on('data', (chunk: Buffer) => {
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
