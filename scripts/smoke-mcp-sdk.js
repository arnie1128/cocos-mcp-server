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
};

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

        console.log('\n✅ all smoke checks passed');
    } catch (err) {
        console.error('\n❌ smoke test failed:', err.message);
        exitCode = 1;
    } finally {
        await server.stop();
        process.exit(exitCode);
    }
})();
