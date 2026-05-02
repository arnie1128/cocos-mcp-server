// Smoke test: bring up MCPServer (SDK-backed) with a stub tool registry,
// hit /health, /api/tools, POST /mcp tools/list, POST /mcp tools/call.
// Run from repo root: node scripts/smoke-mcp-sdk.js
//
// Avoids loading the full registry (which depends on Cocos Editor.Project) by
// providing a minimal stub that satisfies the ToolExecutor interface.

const http = require('http');
const path = require('path');

const { MCPServer } = require(path.join(__dirname, '..', 'dist', 'mcp-server-sdk.js'));

const stubRegistry = {
    demo: {
        getTools() {
            return [{
                name: 'echo',
                description: 'Echo back the args (smoke test stub).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        msg: { type: 'string', description: 'Message to echo' },
                    },
                    required: ['msg'],
                    additionalProperties: false,
                },
            }, {
                name: 'fail',
                description: 'Always returns success:false (smoke test stub).',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            }];
        },
        async execute(toolName, args) {
            if (toolName === 'echo') {
                return { success: true, data: { echoed: args }, message: 'ok' };
            }
            if (toolName === 'fail') {
                return { success: false, error: 'intentional failure' };
            }
            throw new Error(`unknown demo tool: ${toolName}`);
        },
    },
    // Stub the 3 categories that back T-P3-1 resources so we can smoke-test
    // the resource read pipeline end-to-end without booting Cocos Editor.
    scene: stubExecutor({
        get_current_scene: { name: 'StubScene', uuid: 'stub-scene-uuid', nodeCount: 0 },
        get_scene_list: [{ name: 'StubScene', uuid: 'stub-scene-uuid', path: 'db://assets/StubScene.scene' }],
        get_scene_hierarchy: { uuid: 'stub-scene-uuid', children: [] },
    }),
    prefab: stubExecutor({
        get_prefab_list: (args) => [{ folder: args.folder ?? 'db://assets', count: 0 }],
    }),
    project: stubExecutor({
        get_project_info: { name: 'StubProject', version: '0.0.0' },
        get_assets: (args) => [{ type: args.type ?? 'all', folder: args.folder ?? 'db://assets', items: [] }],
    }),
};

function stubExecutor(map) {
    return {
        getTools() { return []; },
        async execute(toolName, args) {
            if (!(toolName in map)) throw new Error(`stub missing: ${toolName}`);
            const v = map[toolName];
            const data = typeof v === 'function' ? v(args ?? {}) : v;
            return { success: true, data, message: 'stub-ok' };
        },
    };
}

const PORT = 18585;
const settings = { port: PORT, autoStart: false, enableDebugLog: true, allowedOrigins: [], maxConnections: 0 };

function postJson(pathname, payload, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(payload));
        const req = http.request({
            host: '127.0.0.1',
            port: PORT,
            method: 'POST',
            path: pathname,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
                'Accept': 'application/json, text/event-stream',
                ...extraHeaders,
            },
        }, (res) => {
            let chunks = '';
            res.on('data', d => { chunks += d.toString(); });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: chunks }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getJson(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: PORT, method: 'GET', path: pathname }, (res) => {
            let chunks = '';
            res.on('data', d => { chunks += d.toString(); });
            res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    const server = new MCPServer(settings, stubRegistry);
    await server.start();
    let exitCode = 0;
    try {
        // 1. /health
        const health = await getJson('/health');
        console.log('[/health]', health.status, health.body);
        if (health.status !== 200 || !/"status":"ok"/.test(health.body)) throw new Error('health check failed');

        // 2. /api/tools
        const apiTools = await getJson('/api/tools');
        console.log('[/api/tools]', apiTools.status, apiTools.body.substring(0, 200));
        if (apiTools.status !== 200) throw new Error('/api/tools failed');

        // 3. POST /mcp initialize (required first by SDK)
        const init = await postJson('/mcp', {
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'smoke-test', version: '0.0.0' },
            },
        });
        console.log('[POST /mcp initialize]', init.status, init.body.substring(0, 300));
        if (init.status !== 200) throw new Error('initialize failed');
        const sessionId = init.headers['mcp-session-id']; // may be undefined in stateless mode
        const sessionHeaders = sessionId ? { 'mcp-session-id': sessionId } : {};

        // 4. POST /mcp tools/list
        const list = await postJson('/mcp', {
            jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
        }, sessionHeaders);
        console.log('[POST /mcp tools/list]', list.status, list.body.substring(0, 400));
        if (list.status !== 200 || !/demo_echo/.test(list.body)) throw new Error('tools/list missing demo_echo');

        // 5. POST /mcp tools/call success path
        const callOk = await postJson('/mcp', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'demo_echo', arguments: { msg: 'hello' } },
        }, sessionHeaders);
        console.log('[POST /mcp tools/call success]', callOk.status, callOk.body.substring(0, 400));
        if (callOk.status !== 200) throw new Error('tools/call success non-200');
        if (!/"structuredContent"/.test(callOk.body)) throw new Error('expected structuredContent on success');
        if (/"isError":true/.test(callOk.body)) throw new Error('success path should not have isError');

        // 6. POST /mcp tools/call failure path
        const callFail = await postJson('/mcp', {
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'demo_fail', arguments: {} },
        }, sessionHeaders);
        console.log('[POST /mcp tools/call failure]', callFail.status, callFail.body.substring(0, 400));
        if (!/"isError":true/.test(callFail.body)) throw new Error('failure path should have isError:true');
        if (!/intentional failure/.test(callFail.body)) throw new Error('failure path should surface error message');

        // 7. POST /api/demo/echo
        const apiCall = await postJson('/api/demo/echo', { msg: 'rest-hi' });
        console.log('[POST /api/demo/echo]', apiCall.status, apiCall.body.substring(0, 200));
        if (apiCall.status !== 200 || !/rest-hi/.test(apiCall.body)) throw new Error('REST API call failed');

        // 8. POST /mcp resources/list
        const resList = await postJson('/mcp', {
            jsonrpc: '2.0', id: 5, method: 'resources/list', params: {},
        }, sessionHeaders);
        console.log('[POST /mcp resources/list]', resList.status, resList.body.substring(0, 400));
        if (resList.status !== 200) throw new Error('resources/list non-200');
        if (!/cocos:\/\/scene\/current/.test(resList.body)) throw new Error('resources/list missing cocos://scene/current');
        if (!/cocos:\/\/assets/.test(resList.body)) throw new Error('resources/list missing cocos://assets');
        if (!/cocos:\/\/docs\/landmines/.test(resList.body)) throw new Error('resources/list missing cocos://docs/landmines (v2.3.0)');
        if (!/text\/markdown/.test(resList.body)) throw new Error('resources/list missing text/markdown mimeType (v2.3.0)');

        // 9. POST /mcp resources/templates/list
        const tmplList = await postJson('/mcp', {
            jsonrpc: '2.0', id: 6, method: 'resources/templates/list', params: {},
        }, sessionHeaders);
        console.log('[POST /mcp resources/templates/list]', tmplList.status, tmplList.body.substring(0, 300));
        if (tmplList.status !== 200) throw new Error('resources/templates/list non-200');
        if (!/cocos:\/\/assets\{\?type,folder\}/.test(tmplList.body)) throw new Error('templates/list missing cocos://assets template');

        // 10. POST /mcp resources/read — static URI (round-trip equivalence to tool call)
        const resRead = await postJson('/mcp', {
            jsonrpc: '2.0', id: 7, method: 'resources/read',
            params: { uri: 'cocos://scene/current' },
        }, sessionHeaders);
        console.log('[POST /mcp resources/read static]', resRead.status, resRead.body.substring(0, 400));
        if (resRead.status !== 200) throw new Error('resources/read static non-200');
        if (!/StubScene/.test(resRead.body)) throw new Error('resources/read static did not invoke backend');
        if (!/"mimeType":"application\/json"/.test(resRead.body)) throw new Error('expected application/json mimeType');

        // 11. POST /mcp resources/read — template URI with query params
        const resTmpl = await postJson('/mcp', {
            jsonrpc: '2.0', id: 8, method: 'resources/read',
            params: { uri: 'cocos://assets?type=prefab&folder=db://assets/ui' },
        }, sessionHeaders);
        console.log('[POST /mcp resources/read template]', resTmpl.status, resTmpl.body.substring(0, 400));
        if (resTmpl.status !== 200) throw new Error('resources/read template non-200');
        // Resource read returns JSON-stringified body inside .text — escapes get doubled on the wire
        if (!/\\"type\\":\\"prefab\\"/.test(resTmpl.body)) throw new Error('template URI did not pass type query through');
        if (!/db:\/\/assets\/ui/.test(resTmpl.body)) throw new Error('template URI did not pass folder query through');

        // 12. POST /mcp resources/read — unknown URI must error
        const resErr = await postJson('/mcp', {
            jsonrpc: '2.0', id: 9, method: 'resources/read',
            params: { uri: 'cocos://nope/zzz' },
        }, sessionHeaders);
        console.log('[POST /mcp resources/read unknown]', resErr.status, resErr.body.substring(0, 300));
        if (!/Unknown resource URI/.test(resErr.body)) throw new Error('unknown URI should surface error');

        // 13. POST /mcp resources/read — markdown docs resource (v2.3.0)
        const resDocs = await postJson('/mcp', {
            jsonrpc: '2.0', id: 10, method: 'resources/read',
            params: { uri: 'cocos://docs/handoff' },
        }, sessionHeaders);
        console.log('[POST /mcp resources/read docs/handoff]', resDocs.status, resDocs.body.substring(0, 200));
        if (resDocs.status !== 200) throw new Error('resources/read docs/handoff non-200');
        if (!/"mimeType":"text\/markdown"/.test(resDocs.body)) throw new Error('docs resource should report text/markdown mimeType');
        if (!/Session Handoff/.test(resDocs.body)) throw new Error('docs/handoff should contain HANDOFF.md content');

        // 14. tools/list should carry [specialist] / [primary] prefix tags (v2.3.0)
        if (!/\[specialist\] Echo/.test(list.body)) throw new Error('tools/list should prefix non-primary tools with [specialist]');

        // 15. v2.6.0 T-V26-1: /game/status reports idle when no client polled
        const gameStatusIdle = await getJson('/game/status');
        console.log('[/game/status idle]', gameStatusIdle.status, gameStatusIdle.body);
        if (gameStatusIdle.status !== 200) throw new Error('/game/status non-200');
        if (!/"connected":false/.test(gameStatusIdle.body)) throw new Error('/game/status should report connected:false before any poll');
        if (!/"queued":false/.test(gameStatusIdle.body)) throw new Error('/game/status should report queued:false initially');

        // 16. /health includes gameClient block (v2.6.0)
        const healthV26 = await getJson('/health');
        if (!/"gameClient"/.test(healthV26.body)) throw new Error('/health should include gameClient block in v2.6.0');

        // 17. /game/command GET returns null when nothing queued + flips lastPollAt
        const cmdEmpty = await getJson('/game/command');
        console.log('[/game/command empty]', cmdEmpty.status, cmdEmpty.body);
        if (cmdEmpty.status !== 200) throw new Error('/game/command non-200');
        if (cmdEmpty.body.trim() !== 'null') throw new Error('/game/command should return null when idle');
        const gameStatusAfterPoll = await getJson('/game/status');
        if (!/"connected":true/.test(gameStatusAfterPoll.body)) throw new Error('/game/status should mark connected after a poll');

        // 18. /game/result with no pending command should 409
        const resultRejected = await postJson('/game/result', { id: 'cmd_zzz', success: true });
        console.log('[/game/result no pending]', resultRejected.status, resultRejected.body);
        if (resultRejected.status !== 409) throw new Error('/game/result should reject when no command pending');

        // 19. v2.6.1: /game/result missing success boolean → 400
        const resultBadShape = await postJson('/game/result', { id: 'cmd_zzz', error: 'oops' });
        console.log('[/game/result bad shape]', resultBadShape.status, resultBadShape.body);
        if (resultBadShape.status !== 400) throw new Error('/game/result should reject {id, error} without boolean success');

        // 20. v2.6.1: full queue round-trip via the demo executor.
        //   - simulate a poll-and-respond cycle by directly hitting the
        //     queue module's exports through dist/.
        const queueModule = require('../dist/lib/game-command-queue.js');
        queueModule.resetForTest();
        // host queues a command (would normally happen inside a tool handler)
        const queued = queueModule.queueGameCommand('screenshot');
        if (!queued.ok) throw new Error('queueGameCommand failed: ' + queued.error);
        // first poll claims it
        const pollClaim = await getJson('/game/command');
        if (!/"id":"/.test(pollClaim.body)) throw new Error('first poll should claim the queued command');
        // second poll while still pending must NOT re-deliver (claim guard)
        const pollAgain = await getJson('/game/command');
        if (pollAgain.body.trim() !== 'null') throw new Error('claimed command should not be re-delivered to a second poll');
        // client posts result
        const postRes = await postJson('/game/result', { id: queued.id, success: true, data: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 1, height: 1 } });
        console.log('[/game/result accept]', postRes.status, postRes.body || '<empty>');
        if (postRes.status !== 204) throw new Error('/game/result valid post should 204');
        // After post, _result is set but _pending stays until awaitCommandResult
        // drains it (mirrors the real tool-side flow). Drain and verify idle.
        const drained = await queueModule.awaitCommandResult(queued.id, 1000);
        if (!drained.ok) throw new Error('awaitCommandResult should resolve after result post');
        if (!drained.result || drained.result.success !== true) throw new Error('drained result should match the post');
        const statusAfter = await getJson('/game/status');
        if (!/"queued":false/.test(statusAfter.body)) throw new Error('queue should be idle after awaiter drains result');
        queueModule.resetForTest();

        // 21. v2.7.0 #2: /game/* CORS scoping — disallowed origin should 403
        //   on POST/GET. v2.7.1 review fixes: also assert ACAO is OMITTED on
        //   disallowed (Claude 🔴), preflight 403 on disallowed (Claude 🔴),
        //   Origin:null literal allowed (Claude 🟡), localhost.evil.com
        //   strict reject (Claude 🟡).
        const reqWith = (method, path, headers) => new Promise((resolve, reject) => {
            const req = http.request({ host: '127.0.0.1', port: PORT, method, path, headers },
                (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve({ status: r.statusCode, body: b, headers: r.headers })); });
            req.on('error', reject);
            req.end();
        });

        const blockedOrigin = await reqWith('GET', '/game/status', { 'Origin': 'http://evil.example' });
        console.log('[/game/status disallowed-origin]', blockedOrigin.status, blockedOrigin.body);
        if (blockedOrigin.status !== 403) throw new Error('/game/* should reject disallowed Origin with 403');
        if (blockedOrigin.headers['access-control-allow-origin']) throw new Error('disallowed origin must NOT receive ACAO header');

        // Preflight (OPTIONS) on disallowed origin → 403 (Claude 🔴 fix).
        const blockedPreflight = await reqWith('OPTIONS', '/game/status', { 'Origin': 'http://evil.example', 'Access-Control-Request-Method': 'GET' });
        console.log('[/game/status preflight disallowed]', blockedPreflight.status);
        if (blockedPreflight.status !== 403) throw new Error('preflight on disallowed origin should 403');

        // Strict hostname check: localhost.evil.com should NOT match (Claude 🟡 lock).
        const subdomainAttack = await reqWith('GET', '/game/status', { 'Origin': 'http://localhost.evil.com:1234' });
        if (subdomainAttack.status !== 403) throw new Error('subdomain "localhost.evil.com" must be rejected by strict === match');
        if (subdomainAttack.headers['access-control-allow-origin']) throw new Error('subdomain attack must not receive ACAO');

        // Allowed origin (localhost).
        const allowedOrigin = await reqWith('GET', '/game/status', { 'Origin': 'http://localhost:7456' });
        console.log('[/game/status allowed-origin]', allowedOrigin.status, 'ACAO:', allowedOrigin.headers['access-control-allow-origin']);
        if (allowedOrigin.status !== 200) throw new Error('/game/* should accept localhost Origin');
        if (allowedOrigin.headers['access-control-allow-origin'] !== 'http://localhost:7456') throw new Error('ACAO should echo allowed origin');

        // Origin: null (file:// pages, sandboxed iframes — Claude 🟡 lock).
        const nullOrigin = await reqWith('GET', '/game/status', { 'Origin': 'null' });
        if (nullOrigin.status !== 200) throw new Error('Origin: null should be allowed (file:// PIE webview)');
        if (nullOrigin.headers['access-control-allow-origin'] !== 'null') throw new Error('Origin: null should echo ACAO: null');

        // No-Origin (curl/Node fetch without Origin) should also pass with ACAO=*.
        const noOrigin = await getJson('/game/status');
        if (noOrigin.status !== 200) throw new Error('/game/* should accept no-Origin requests');

        // 22. v2.6.1: /game/result body cap (32 MB) — request a 33 MB body
        //   should be rejected with 413. Use direct http.request with a
        //   Content-Length so the server reads the stream and trips the cap.
        // Skipped: would require allocating a 33 MB string for transmit and
        // is slow; trust the unit-level guard in readBody. Smoke covers
        // the smaller payload path above.

        console.log('\n✅ all smoke checks passed');
    } catch (err) {
        console.error('\n❌ smoke test failed:', err.message);
        exitCode = 1;
    } finally {
        await server.stop();
        process.exit(exitCode);
    }
})();
