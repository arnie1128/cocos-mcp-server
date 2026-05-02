#!/usr/bin/env node
/**
 * probe-broadcast.js — sample cocos editor IPC broadcast events to
 * measure density per message type.
 *
 * Why: T-V25-3 (T-P3-3 Notifications) needs an evidence-backed
 * debounce window. Without data, "1s per URI" is a guess. This
 * script registers listeners for likely-noisy broadcast types
 * inside the editor host process, samples for SAMPLE_MS (default
 * 30 000), then prints events/sec per type.
 *
 * Usage:
 *   1. Open the cocos project in the editor and start the
 *      cocos-mcp-server extension.
 *   2. Open the extension panel and turn ON
 *      `enableEditorContextEval` (settings/mcp-server.json
 *      → "enableEditorContextEval": true). Required because the
 *      probe runs inside the editor host process, which is the only
 *      context that can call Editor.Message.__protected__.addBroadcastListener.
 *   3. While the probe is running (default 30s), do typical work:
 *      drag nodes, edit properties, save the scene, modify a script,
 *      switch scenes, import an asset.
 *   4. node scripts/probe-broadcast.js
 *
 * Output: JSON summary printed to stdout. Per message type:
 *   { count, eventsPerSec, firstAt, lastAt }
 *
 * Caveat: cocos-mcp-server's `enableEditorContextEval` is OFF by
 * default for security. Turn it OFF again after the probe finishes.
 */

'use strict';

const http = require('http');

const SERVER = process.env.MCP_SERVER || 'http://127.0.0.1:3000';
const SAMPLE_MS = Number(process.env.PROBE_SAMPLE_MS || 30000);

const MESSAGE_TYPES = [
    // Scene mutation events (most likely to fire on drag/edit)
    'scene:ready',
    'scene:close',
    'scene:change-node',
    'scene:change-prefab',
    'scene:select-nodes',
    'scene:unselect-nodes',
    'scene:save-asset',
    // Asset DB events (fire on import / refresh)
    'asset-db:ready',
    'asset-db:close',
    'asset-db:asset-add',
    'asset-db:asset-change',
    'asset-db:asset-delete',
    // Build / preview
    'build-worker:ready',
    'build-worker:closed',
];

function postJson(pathname, body) {
    const url = new URL(pathname, SERVER);
    const data = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request({
            method: 'POST',
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
            timeout: SAMPLE_MS + 30000,
        }, res => {
            let chunks = '';
            res.on('data', c => { chunks += c; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(chunks) });
                } catch (err) {
                    reject(new Error(`bad JSON from ${pathname}: ${chunks.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error(`request timed out after ${SAMPLE_MS + 30000}ms`)));
        req.write(data);
        req.end();
    });
}

function getJson(pathname) {
    const url = new URL(pathname, SERVER);
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
        }, res => {
            let chunks = '';
            res.on('data', c => { chunks += c; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(chunks));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
    });
}

// Build an editor-context expression that registers listeners for
// MESSAGE_TYPES, samples for SAMPLE_MS, then unregisters and resolves
// with `{ entries: [...], typesObserved: [...] }`. Embedded as a
// JSON.stringify'd literal so the exact runtime constants are baked in.
function buildSamplingExpression() {
    const types = JSON.stringify(MESSAGE_TYPES);
    const ms = SAMPLE_MS;
    return `
(async () => {
    const proto = Editor && Editor.Message && Editor.Message.__protected__;
    if (!proto || typeof proto.addBroadcastListener !== 'function') {
        return { error: 'Editor.Message.__protected__.addBroadcastListener unavailable' };
    }
    const types = ${types};
    const entries = [];
    const handlers = types.map(t => {
        const fn = function () {
            try {
                entries.push({ type: t, ts: Date.now() });
                if (entries.length > 5000) entries.shift();
            } catch (_) {}
        };
        proto.addBroadcastListener(t, fn);
        return [t, fn];
    });
    const startedAt = Date.now();
    await new Promise(r => setTimeout(r, ${ms}));
    const stoppedAt = Date.now();
    handlers.forEach(([t, fn]) => {
        try { proto.removeBroadcastListener(t, fn); } catch (_) {}
    });
    return { startedAt, stoppedAt, durationMs: stoppedAt - startedAt, entries };
})()
`;
}

function summarise(samplingResult) {
    if (!samplingResult || samplingResult.error) {
        return { error: samplingResult?.error || 'no data returned' };
    }
    const { entries, durationMs } = samplingResult;
    const seconds = durationMs / 1000;
    const byType = new Map();
    for (const e of entries) {
        if (!byType.has(e.type)) byType.set(e.type, { count: 0, firstAt: e.ts, lastAt: e.ts });
        const slot = byType.get(e.type);
        slot.count += 1;
        slot.lastAt = e.ts;
    }
    const summary = {};
    let total = 0;
    for (const [type, slot] of byType.entries()) {
        total += slot.count;
        summary[type] = {
            count: slot.count,
            eventsPerSec: Number((slot.count / seconds).toFixed(3)),
            firstAt: new Date(slot.firstAt).toISOString(),
            lastAt: new Date(slot.lastAt).toISOString(),
        };
    }
    return {
        durationMs,
        totalEvents: total,
        totalEventsPerSec: Number((total / seconds).toFixed(3)),
        byType: summary,
        observedTypes: Object.keys(summary).sort(),
        notObservedTypes: MESSAGE_TYPES.filter(t => !byType.has(t)),
    };
}

async function main() {
    process.stderr.write(`[probe-broadcast] sampling for ${SAMPLE_MS}ms — do typical editor work now (drag nodes, edit, save, import...)\n`);
    let health;
    try {
        health = await getJson('/health');
    } catch (err) {
        process.stderr.write(`[probe-broadcast] cannot reach ${SERVER}/health: ${err.message}\n`);
        process.exit(1);
    }
    process.stderr.write(`[probe-broadcast] server up (${health.tools} tools), starting sample...\n`);

    const code = buildSamplingExpression();
    const resp = await postJson('/api/debug/execute_javascript', { code, context: 'editor' });
    if (resp.status !== 200) {
        process.stderr.write(`[probe-broadcast] HTTP ${resp.status}: ${JSON.stringify(resp.body).slice(0, 500)}\n`);
        process.exit(1);
    }
    const result = resp.body?.result;
    if (!result?.success) {
        // Most common: enableEditorContextEval is off.
        process.stderr.write(`[probe-broadcast] tool reported failure: ${result?.error || JSON.stringify(result).slice(0,300)}\n`);
        process.stderr.write('[probe-broadcast] If the error mentions "editor context eval", flip enableEditorContextEval ON in the extension panel and retry. Turn it OFF again afterward.\n');
        process.exit(1);
    }
    const data = result.data;
    // execute_javascript wraps the resolved value in data.result (per debug-tools.ts shape).
    // Fall through both shapes defensively.
    const inner = data?.result ?? data?.value ?? data;
    const summary = summarise(inner);
    process.stdout.write(JSON.stringify(summary, null, 2));
    process.stdout.write('\n');
}

main().catch(err => {
    process.stderr.write(`[probe-broadcast] error: ${err.stack || err.message}\n`);
    process.exit(1);
});
