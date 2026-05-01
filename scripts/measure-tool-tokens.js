// One-off token-usage measurement for the cocos-mcp-server fork.
// Decides whether P2 (collapse 160 tools into ~14 action-router tools) is
// worth doing.
//
// Run: node scripts/measure-tool-tokens.js
//
// What it measures:
//   1. Static tools/list payload — the JSON the model loads once per session.
//      Compares 3 shapes:
//         - current  : 160 flat tools
//         - router-A : 14 action routers, oneOf preserving every sub-schema
//                      (lossless: same arg validation as today)
//         - router-B : 14 action routers, enum + free-form args
//                      (lossy: drops per-action arg validation)
//   2. Round-trip cost — request + response bytes for a few sample tools.
//      Boots the real SDK server with a stub registry (so no Cocos Editor
//      needed) to confirm framing overhead is small compared to schema cost.
//
// Why the two router modes:
//   The v1.5.0 marketing claim of "-50% tokens" is only achievable with
//   mode B (lose validation). Mode A is what an honest P2 would actually
//   ship. Reporting both gives the upper and lower bound of what P2 could
//   plausibly save.
//
// Token estimate uses chars/ratio with three ratios. The decision threshold
// (>=30% vs <15%) is wide enough that ratio precision does not matter.

const http = require('http');
const path = require('path');

// Stub the Cocos Editor globals so the registry can be loaded outside the
// editor process. Tool implementations reference these from `execute()`,
// not from `getTools()`, so schema construction is unaffected.
global.Editor = {
    Project: { path: 'D:/fake/project' },
    Message: {
        request: async () => ({}),
        send: () => {},
    },
};

const { createToolRegistry } = require(path.join(__dirname, '..', 'dist', 'tools', 'registry.js'));
const { MCPServer } = require(path.join(__dirname, '..', 'dist', 'mcp-server-sdk.js'));

// ---------- token estimate ----------

const RATIOS = {
    lo: 4.0, // upper bound on chars-per-token (= lower bound on tokens) — English-leaning
    mid: 3.5, // mid estimate for JSON-heavy content (Claude tokenizer typical)
    hi: 3.0, // lower bound on chars-per-token — dense JSON
};

function tokens(s) {
    const c = s.length;
    return {
        chars: c,
        tokensLo: Math.round(c / RATIOS.lo),
        tokensMid: Math.round(c / RATIOS.mid),
        tokensHi: Math.round(c / RATIOS.hi),
    };
}

function fmtTokens(label, t) {
    return `${label.padEnd(40)} chars=${String(t.chars).padStart(7)}  tokens≈${String(t.tokensLo).padStart(5)}/${String(t.tokensMid).padStart(5)}/${String(t.tokensHi).padStart(5)} (lo/mid/hi)`;
}

// ---------- Part 1: current 160-tool tools/list ----------

const registry = createToolRegistry();
const allTools = [];
for (const [category, executor] of Object.entries(registry)) {
    for (const t of executor.getTools()) {
        allTools.push({
            category,
            rawName: t.name,
            name: `${category}_${t.name}`,
            description: t.description,
            inputSchema: t.inputSchema,
        });
    }
}

const currentList = {
    tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
    })),
};
const currentJson = JSON.stringify(currentList);

// ---------- Part 2: simulate P2 — 14 action routers ----------

const byCategory = {};
for (const t of allTools) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
}

// Mode A: lossless oneOf — every sub-schema preserved as today, framed by an
// action discriminator. This is what an honest P2 would ship if it wanted to
// keep arg validation.
function buildRouterA(category, tools) {
    return {
        name: category,
        description: `${category} group — call with {action: <name>, args: <action-args>}. Actions: ${tools.map(t => t.rawName).join(', ')}.`,
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: tools.map(t => t.rawName) },
            },
            required: ['action'],
            oneOf: tools.map(t => ({
                title: t.rawName,
                description: t.description,
                properties: {
                    action: { const: t.rawName },
                    args: t.inputSchema,
                },
                required: ['action'],
            })),
        },
    };
}

// Mode B: lossy enum-only. Drops every sub-schema; relies on the model to
// infer args from the description. This is the shape that gets to the
// "-50% tokens" v1.5.0 marketing claim.
function buildRouterB(category, tools) {
    const actionLines = tools.map(t => `  - ${t.rawName}: ${t.description}`).join('\n');
    return {
        name: category,
        description: `${category} group. Actions:\n${actionLines}`,
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: tools.map(t => t.rawName) },
                args: { type: 'object', description: 'Action-specific arguments.' },
            },
            required: ['action'],
        },
    };
}

const p2A = { tools: Object.entries(byCategory).map(([c, ts]) => buildRouterA(c, ts)) };
const p2B = { tools: Object.entries(byCategory).map(([c, ts]) => buildRouterB(c, ts)) };
const p2AJson = JSON.stringify(p2A);
const p2BJson = JSON.stringify(p2B);

const cur = tokens(currentJson);
const a = tokens(p2AJson);
const b = tokens(p2BJson);

const pct = (small, big) => ((1 - small / big) * 100).toFixed(1);

console.log('===== STATIC tools/list payload =====');
console.log(fmtTokens('current (160 flat tools)', cur));
console.log(fmtTokens('P2 router-A (14 lossless oneOf)', a));
console.log(fmtTokens('P2 router-B (14 lossy enum-only)', b));
console.log('');
console.log(`router-A vs current : ${pct(a.chars, cur.chars)}% reduction (lossless)`);
console.log(`router-B vs current : ${pct(b.chars, cur.chars)}% reduction (lossy — drops arg validation)`);
console.log('');

// Per-category breakdown — useful for spotting which categories carry weight
console.log('===== per-category char count (flat vs router-A vs router-B) =====');
const rows = Object.entries(byCategory).map(([c, ts]) => {
    const flat = JSON.stringify({
        tools: ts.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    const ra = JSON.stringify({ tools: [buildRouterA(c, ts)] });
    const rb = JSON.stringify({ tools: [buildRouterB(c, ts)] });
    return {
        category: c,
        n: ts.length,
        flat: flat.length,
        routerA: ra.length,
        routerB: rb.length,
        deltaA: pct(ra.length, flat.length),
        deltaB: pct(rb.length, flat.length),
    };
});
console.log('category'.padEnd(18), 'n'.padStart(3), 'flat'.padStart(7), 'routerA'.padStart(8), 'routerB'.padStart(8), 'A-Δ%'.padStart(7), 'B-Δ%'.padStart(7));
for (const r of rows) {
    console.log(
        r.category.padEnd(18),
        String(r.n).padStart(3),
        String(r.flat).padStart(7),
        String(r.routerA).padStart(8),
        String(r.routerB).padStart(8),
        String(r.deltaA).padStart(7),
        String(r.deltaB).padStart(7),
    );
}
console.log('');

// ---------- Part 3: round-trip — sample tools/call against real SDK server ----------

const SAMPLES = [
    { category: 'node', tool: 'create_node', args: { name: 'TestSprite', layer: 'UI_2D' } },
    { category: 'component', tool: 'set_component_property', args: { nodeUuid: 'abc-uuid', componentType: 'cc.Sprite', property: 'color', value: { r: 255, g: 128, b: 64, a: 255 } } },
    { category: 'scene', tool: 'save_scene', args: {} },
    { category: 'project', tool: 'get_project_info', args: {} },
    { category: 'prefab', tool: 'create_prefab_from_node', args: { nodeUuid: 'def-uuid', savePath: 'db://assets/test.prefab' } },
];

// Stub registry that returns representative success payloads for the sample
// tools. We need the real SDK server to count framing overhead correctly.
const sampleResponseBody = {
    nodeUuid: '99ad7c2d-9a9f-4a2b-91de-aaaaaaaa0001',
    name: 'TestSprite',
    layer: 33554432,
    children: [],
    components: [{ type: 'cc.UITransform', uuid: 'comp-uuid-0001' }],
};

const stubRegistry = {};
for (const t of allTools) {
    if (!stubRegistry[t.category]) {
        stubRegistry[t.category] = {
            getTools() {
                return registry[t.category].getTools();
            },
            async execute(toolName, args) {
                return {
                    success: true,
                    data: { ...sampleResponseBody, _toolName: toolName, _args: args },
                    message: `${toolName} ok`,
                };
            },
        };
    }
}

const PORT = 18586;
const settings = { port: PORT, autoStart: false, enableDebugLog: false, allowedOrigins: [], maxConnections: 0 };

function postJson(pathname, payload, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(payload));
        const req = http.request({
            host: '127.0.0.1', port: PORT, method: 'POST', path: pathname,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
                'Accept': 'application/json, text/event-stream',
                ...extraHeaders,
            },
        }, (res) => {
            let chunks = '';
            res.on('data', d => { chunks += d.toString(); });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: chunks, requestBytes: body.length }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

(async () => {
    const server = new MCPServer(settings, stubRegistry);
    await server.start();
    let exitCode = 0;
    try {
        const init = await postJson('/mcp', {
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'measure', version: '0.0.0' } },
        });
        if (init.status !== 200) throw new Error('initialize failed: ' + init.body);
        const sessionId = init.headers['mcp-session-id'];
        const sessionHeaders = sessionId ? { 'mcp-session-id': sessionId } : {};

        console.log('===== ROUND-TRIP per-call cost (real SDK server, stub registry) =====');
        console.log('sample'.padEnd(45), 'reqB'.padStart(6), 'respB'.padStart(7), 'rtTok-mid'.padStart(10));
        let id = 100;
        let totalReq = 0, totalResp = 0;
        for (const s of SAMPLES) {
            const callName = `${s.category}_${s.tool}`;
            const r = await postJson('/mcp', {
                jsonrpc: '2.0', id: id++, method: 'tools/call',
                params: { name: callName, arguments: s.args },
            }, sessionHeaders);
            const respBytes = Buffer.byteLength(r.body);
            const rtTok = Math.round((r.requestBytes + respBytes) / RATIOS.mid);
            console.log(callName.padEnd(45), String(r.requestBytes).padStart(6), String(respBytes).padStart(7), String(rtTok).padStart(10));
            totalReq += r.requestBytes; totalResp += respBytes;
        }
        console.log('-'.repeat(80));
        console.log('TOTAL'.padEnd(45), String(totalReq).padStart(6), String(totalResp).padStart(7), String(Math.round((totalReq + totalResp) / RATIOS.mid)).padStart(10));
        console.log('');
        console.log(`avg per-call round-trip ≈ ${Math.round((totalReq + totalResp) / SAMPLES.length / RATIOS.mid)} tokens (mid)`);
        console.log('');

        // P2 round-trip overhead estimate: each call gains an `action` field in
        // params.arguments. About +20 chars per call → ~6 tokens. Negligible
        // vs. one-time tools/list cost.
        const p2OverheadChars = 20;
        console.log(`P2 per-call delta: +~${p2OverheadChars} chars (≈ ${Math.round(p2OverheadChars / RATIOS.mid)} tokens) per call`);
        console.log('');

        // ---------- decision summary ----------
        console.log('===== DECISION =====');
        const aDelta = parseFloat(pct(a.chars, cur.chars));
        const bDelta = parseFloat(pct(b.chars, cur.chars));
        const aLabel = aDelta >= 0 ? `${aDelta}% smaller` : `${-aDelta}% LARGER`;
        const bLabel = bDelta >= 0 ? `${bDelta}% smaller` : `${-bDelta}% LARGER`;
        console.log(`router-A (lossless) : ${aLabel} than current`);
        console.log(`router-B (lossy)    : ${bLabel} than current  (drops per-action arg validation)`);
        console.log(`thresholds: >=30% smaller -> START P2,  <15% smaller -> CLOSE P2,  else PRESENT`);
        if (aDelta >= 30) {
            console.log(`decision: START P2 — lossless schema is ${aDelta}% smaller (>= 30%)`);
        } else if (aDelta < 15) {
            console.log(`decision: CLOSE P2 — lossless schema is only ${aLabel}; router-B's ${bDelta}% gain costs arg validation, not worth it`);
        } else {
            console.log(`decision: PRESENT — lossless gain is ${aDelta}% (mid range); needs human call`);
        }
    } catch (err) {
        console.error('measurement failed:', err.stack || err.message);
        exitCode = 1;
    } finally {
        await server.stop();
        process.exit(exitCode);
    }
})();
