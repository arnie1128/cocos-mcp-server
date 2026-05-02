#!/usr/bin/env node
// Live MCP server test harness — runs against the editor extension.
// Usage: node scripts/live-test.js [--port 3000]
// Hits /health, /api/tools, opens an MCP session, exercises representative
// tools per category, runs write flows that create / mutate / delete nodes,
// scene assets, and prefab assets, plus scene-switch with restore guard.
//
// All write operations are wrapped in try/finally so the editor state is
// restored on exit even if a step fails.

const http = require('http');

const PORT = (() => {
    const i = process.argv.indexOf('--port');
    return i >= 0 ? parseInt(process.argv[i + 1], 10) : 3000;
})();

const COLOR = {
    pass: '\x1b[32m',
    fail: '\x1b[31m',
    warn: '\x1b[33m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
};

function rawReq(method, path, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            host: '127.0.0.1', port: PORT, method, path,
            headers: {
                'Accept': 'application/json, text/event-stream',
                ...headers,
            },
        };
        let payload = null;
        if (body !== undefined) {
            payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = payload.length;
        }
        const r = http.request(opts, res => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(chunks); } catch { /* not JSON */ }
                resolve({ status: res.statusCode, headers: res.headers, raw: chunks, json: parsed });
            });
        });
        r.on('error', reject);
        if (payload) r.write(payload);
        r.end();
    });
}

let sessionId = null;
let nextId = 1;
async function mcp(method, params = {}) {
    const r = await rawReq('POST', '/mcp', {
        headers: sessionId ? { 'mcp-session-id': sessionId } : {},
        body: { jsonrpc: '2.0', id: nextId++, method, params },
    });
    return r;
}

async function callTool(name, args = {}) {
    const r = await mcp('tools/call', { name, arguments: args });
    if (!r.json) return { ok: false, status: r.status, raw: r.raw.slice(0, 200) };
    if (r.json.error) return { ok: false, error: r.json.error };
    const result = r.json.result;
    if (result?.isError) {
        return { ok: false, isError: true, text: result.content?.[0]?.text };
    }
    return { ok: true, text: result.content?.[0]?.text, structured: result.structuredContent };
}

const results = { pass: 0, fail: 0, skip: 0, items: [] };
function record(label, ok, detail = '') {
    const tag = ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
    const color = ok === 'skip' ? COLOR.warn : ok ? COLOR.pass : COLOR.fail;
    console.log(`${color}${tag}${COLOR.reset}  ${label}${detail ? '  ' + COLOR.dim + detail + COLOR.reset : ''}`);
    if (ok === true) results.pass++;
    else if (ok === false) results.fail++;
    else results.skip++;
    results.items.push({ label, ok, detail });
}

function abbrev(s, n = 100) {
    if (!s) return '';
    s = String(s);
    return s.length <= n ? s : s.slice(0, n) + '…';
}

async function main() {
    // --- prelude
    const health = await rawReq('GET', '/health');
    record('GET /health', health.status === 200 && /"status":"ok"/.test(health.raw), abbrev(health.raw, 80));

    const toolsList = await rawReq('GET', '/api/tools');
    record('GET /api/tools', toolsList.status === 200 && toolsList.json?.tools?.length > 0,
        `${toolsList.json?.tools?.length} tools`);

    // --- MCP session
    const init = await mcp('initialize', {
        protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: { name: 'live-test', version: '0' },
    });
    sessionId = init.headers['mcp-session-id'];
    record('POST /mcp initialize', init.status === 200 && !!sessionId,
        `protocolVersion=${init.json?.result?.protocolVersion}  session=${sessionId?.slice(0, 8)}…`);

    const list = await mcp('tools/list');
    const toolCount = list.json?.result?.tools?.length || 0;
    record('POST /mcp tools/list', toolCount > 0, `${toolCount} tools`);

    // --- Snapshot original scene path for restore guard
    let originalScenePath = null;
    let originalSceneName = null;
    try {
        const cur = await callTool('scene_get_current_scene', {});
        originalSceneName = cur.structured?.data?.name;
        const sceneList = await callTool('scene_get_scene_list', {});
        const found = sceneList.structured?.data?.find(s => s.name === `${originalSceneName}.scene` || s.name === originalSceneName);
        originalScenePath = found?.path;
        record('snapshot original scene', !!originalScenePath,
            `name=${originalSceneName}  path=${originalScenePath}`);
    } catch (e) {
        record('snapshot original scene', false, e.message);
    }

    // --- Track dirty state so we can skip the scene-switch test rather than
    //     trigger Cocos' "save unsaved changes?" dialog on the user.
    let sceneDirtyAtStart = false;
    try {
        const dirty = await callTool('sceneAdvanced_query_scene_dirty', {});
        sceneDirtyAtStart = dirty.structured?.data?.dirty === true;
    } catch { /* best-effort */ }

    // --- READ-ONLY — every category covered
    const readOnly = [
        ['scene_get_current_scene', {}],
        ['scene_get_scene_list', {}],
        ['scene_get_scene_hierarchy', {}],
        ['node_get_all_nodes', {}],
        ['prefab_get_prefab_list', {}],
        ['project_get_project_info', {}],
        ['project_get_project_settings', {}],
        ['project_get_assets', { type: 'prefab', limit: 5 }],
        ['debug_get_console_logs', { limit: 5 }],
        ['preferences_get_all_preferences', {}],
        ['preferences_query_preferences_config', { name: 'general', key: 'language' }],
        ['server_get_server_status', {}],
        ['broadcast_get_broadcast_log', {}],
        ['broadcast_get_active_listeners', {}],
        ['sceneAdvanced_query_scene_ready', {}],
        ['sceneAdvanced_query_scene_dirty', {}],
        ['sceneAdvanced_query_scene_classes', {}],
        ['sceneAdvanced_query_scene_components', {}],
        ['sceneView_query_gizmo_tool_name', {}],
        ['sceneView_query_view_mode_2d_3d', {}],
        ['sceneView_query_grid_visible', {}],
        ['sceneView_get_scene_view_status', {}],
        ['referenceImage_query_reference_image_config', {}],
        ['referenceImage_list_reference_images', {}],
        ['assetAdvanced_query_asset_db_ready', {}],
        ['validation_validate_json_params', { jsonString: '{"a":1}' }],
        ['validation_safe_string_value', { value: 'hello "world"' }],
    ];

    for (const [name, args] of readOnly) {
        try {
            const r = await callTool(name, args);
            if (r.ok) {
                record(`call ${name}`, true, abbrev(r.text, 100));
            } else if (r.isError) {
                record(`call ${name}`, false, abbrev(r.text || '', 100));
            } else {
                record(`call ${name}`, false, abbrev(JSON.stringify(r.error || r), 100));
            }
        } catch (e) {
            record(`call ${name}`, false, e.message);
        }
    }

    // --- NODE write flow: create / mutate / inspect / delete
    let nodeUuid = null;
    try {
        const allNodesResp = await callTool('node_get_all_nodes', {});
        const canvas = allNodesResp.structured?.data?.nodes?.find(n => n.name === 'Canvas');
        const fallback = allNodesResp.structured?.data?.nodes?.find(n => n.type === 'cc.Node');
        const parentUuid = canvas?.uuid || fallback?.uuid;

        if (!parentUuid) {
            record('node write flow', 'skip', 'no usable parent');
        } else {
            const create = await callTool('node_create_node', { name: 'mcp-livetest-tmp', parentUuid });
            nodeUuid = create.structured?.data?.uuid;
            record('node_create_node', !!nodeUuid && create.ok, nodeUuid ? `uuid=${nodeUuid}` : abbrev(create.text || ''));

            if (nodeUuid) {
                const setPos = await callTool('node_set_node_property', {
                    uuid: nodeUuid, property: 'position', value: { x: 10, y: 20, z: 0 },
                });
                record('node_set_node_property position', setPos.ok, abbrev(setPos.text));

                const info = await callTool('node_get_node_info', { uuid: nodeUuid });
                const pos = info.structured?.data?.position;
                record('node_get_node_info position read-back', info.ok && pos?.x === 10,
                    pos ? `pos=${JSON.stringify(pos)}` : 'no pos');

                const findByName = await callTool('node_find_node_by_name', { name: 'mcp-livetest-tmp' });
                record('node_find_node_by_name', findByName.ok,
                    findByName.structured?.data ? `found ${Array.isArray(findByName.structured.data) ? findByName.structured.data.length : 1}` : abbrev(findByName.text));

                const getComps = await callTool('component_get_components', { nodeUuid });
                record('component_get_components', getComps.ok,
                    `${getComps.structured?.data?.components?.length ?? '?'} components`);

                const addSprite = await callTool('component_add_component', {
                    nodeUuid, componentType: 'cc.Sprite',
                });
                record('component_add_component cc.Sprite', addSprite.ok, abbrev(addSprite.text));

                const compInfo = await callTool('component_get_component_info', {
                    nodeUuid, componentType: 'cc.Sprite',
                });
                record('component_get_component_info', compInfo.ok || compInfo.isError, abbrev(compInfo.text));

                // sceneAdvanced: reset transform on our node
                const resetTr = await callTool('sceneAdvanced_reset_node_transform', { uuid: nodeUuid });
                record('sceneAdvanced_reset_node_transform', resetTr.ok, abbrev(resetTr.text));

                // sceneAdvanced: copy + paste node
                const copy = await callTool('sceneAdvanced_copy_node', { uuids: [nodeUuid] });
                record('sceneAdvanced_copy_node', copy.ok, abbrev(copy.text));

                const paste = await callTool('sceneAdvanced_paste_node', {
                    target: parentUuid,
                    uuids: [nodeUuid],
                    keepWorldTransform: false,
                });
                // BUG fix: paste tool returns `data.newUuids` (string |
                // string[]), not `data.uuids`. Earlier mis-read left
                // pasted nodes orphaned in the scene → the cumulative
                // dirty state then triggered cocos' "save changes?"
                // dialog when the scene-switch test below ran open-scene.
                const pasteData = paste.structured?.data;
                const newRaw = pasteData?.newUuids ?? pasteData;
                const pastedUuids = Array.isArray(newRaw)
                    ? newRaw
                    : typeof newRaw === 'string' ? [newRaw] : [];
                record('sceneAdvanced_paste_node', paste.ok || paste.isError, abbrev(paste.text));
                for (const u of pastedUuids) {
                    if (typeof u === 'string' && u !== nodeUuid) {
                        try { await callTool('node_delete_node', { uuid: u }); } catch {}
                    }
                }
            }
        }
    } catch (e) {
        record('node write flow', false, e.message);
    } finally {
        if (nodeUuid) {
            const del = await callTool('node_delete_node', { uuid: nodeUuid });
            record('node_delete_node (cleanup)', del.ok, abbrev(del.text));
        }
        // Best-effort: delete any leftover livetest-named nodes
        try {
            const f = await callTool('node_find_node_by_name', { name: 'mcp-livetest-tmp' });
            const items = f.structured?.data;
            const list = Array.isArray(items) ? items : items ? [items] : [];
            for (const it of list) {
                if (it?.uuid) {
                    try { await callTool('node_delete_node', { uuid: it.uuid }); } catch {}
                }
            }
        } catch {}
    }

    // --- SCENE VIEW writes — toggle + restore
    try {
        const orig2D = (await callTool('sceneView_query_view_mode_2d_3d', {})).structured?.data?.is2D;
        const flipped = !orig2D;
        const toggle = await callTool('sceneView_change_view_mode_2d_3d', { is2D: flipped });
        record('sceneView_change_view_mode_2d_3d toggle', toggle.ok, abbrev(toggle.text));
        const restore = await callTool('sceneView_change_view_mode_2d_3d', { is2D: !!orig2D });
        record('sceneView_change_view_mode_2d_3d restore', restore.ok, abbrev(restore.text));
    } catch (e) {
        record('sceneView 2d/3d toggle', false, e.message);
    }

    try {
        const origGrid = (await callTool('sceneView_query_grid_visible', {})).structured?.data?.visible;
        const toggle = await callTool('sceneView_set_grid_visible', { visible: !origGrid });
        record('sceneView_set_grid_visible toggle', toggle.ok, abbrev(toggle.text));
        const restore = await callTool('sceneView_set_grid_visible', { visible: !!origGrid });
        record('sceneView_set_grid_visible restore', restore.ok, abbrev(restore.text));
    } catch (e) {
        record('sceneView grid toggle', false, e.message);
    }

    try {
        const origTool = (await callTool('sceneView_query_gizmo_tool_name', {})).structured?.data?.currentTool;
        const newTool = origTool === 'rotation' ? 'position' : 'rotation';
        const change = await callTool('sceneView_change_gizmo_tool', { name: newTool });
        record('sceneView_change_gizmo_tool', change.ok, `${origTool} → ${newTool}: ${abbrev(change.text)}`);
        const restore = await callTool('sceneView_change_gizmo_tool', { name: origTool });
        record('sceneView_change_gizmo_tool restore', restore.ok, abbrev(restore.text));
    } catch (e) {
        record('sceneView gizmo tool', false, e.message);
    }

    // --- PREFAB write flow: create node → save as prefab → cleanup
    let prefabSrcUuid = null;
    let prefabInstanceUuid = null;
    let prefabAssetSaved = false;
    const PREFAB_PATH = 'db://assets/__mcp_livetest.prefab';
    try {
        const allNodesResp = await callTool('node_get_all_nodes', {});
        const canvas = allNodesResp.structured?.data?.nodes?.find(n => n.name === 'Canvas');
        const parentUuid = canvas?.uuid || allNodesResp.structured?.data?.nodes?.find(n => n.type === 'cc.Node')?.uuid;
        if (!parentUuid) {
            record('prefab write flow', 'skip', 'no usable parent');
        } else {
            const node = await callTool('node_create_node', { name: 'mcp-livetest-prefab-src', parentUuid });
            prefabSrcUuid = node.structured?.data?.uuid;
            if (!prefabSrcUuid) {
                record('prefab src node', false, abbrev(node.text));
            } else {
                const make = await callTool('prefab_create_prefab', {
                    nodeUuid: prefabSrcUuid,
                    savePath: PREFAB_PATH,
                    prefabName: '__mcp_livetest',
                });
                prefabAssetSaved = make.ok;
                // CLAUDE.md landmine #8: createPrefab repurposes the
                // source node — original prefabSrcUuid is invalidated.
                // The new prefab instance UUID is surfaced as
                // data.instanceNodeUuid; capture for cleanup.
                prefabInstanceUuid = make.structured?.data?.instanceNodeUuid ?? null;
                record('prefab_create_prefab', make.ok, abbrev(make.text));

                if (make.ok) {
                    const info = await callTool('prefab_get_prefab_info', { prefabPath: PREFAB_PATH });
                    record('prefab_get_prefab_info', info.ok || info.isError, abbrev(info.text));
                }
            }
        }
    } catch (e) {
        record('prefab write flow', false, e.message);
    } finally {
        // CLAUDE.md landmine #8: delete the in-scene prefab instance
        // BEFORE deleting the prefab asset. If the asset goes first
        // the instance loses its prefab link and becomes
        // "(Missing Node)" in the scene tree, leaving an orphan.
        if (prefabInstanceUuid) {
            try { await callTool('node_delete_node', { uuid: prefabInstanceUuid }); } catch {}
        }
        // Belt + braces by name in case instanceNodeUuid wasn't
        // captured (older builds where the helper returns null).
        try {
            const found = await callTool('node_find_nodes', { pattern: 'mcp-livetest-prefab-src' });
            const list = Array.isArray(found.structured?.data) ? found.structured.data : [];
            for (const it of list) {
                if (it?.uuid) {
                    try { await callTool('node_delete_node', { uuid: it.uuid }); } catch {}
                }
            }
        } catch { /* best-effort */ }
        // Original UUID as last resort (createPrefab may not repurpose
        // on every build).
        if (prefabSrcUuid && prefabSrcUuid !== prefabInstanceUuid) {
            try { await callTool('node_delete_node', { uuid: prefabSrcUuid }); } catch {}
        }
        if (prefabAssetSaved) {
            const del = await callTool('project_delete_asset', { url: PREFAB_PATH });
            record('project_delete_asset (prefab cleanup)', del.ok, abbrev(del.text));
        }
    }

    // --- SCENE asset CRUD (does not switch scene)
    let sceneCreated = false;
    const TEST_SCENE_PATH = 'db://assets/__mcp_livetest_scene.scene';
    try {
        const create = await callTool('scene_create_scene', {
            sceneName: '__mcp_livetest_scene',
            savePath: 'db://assets',
        });
        sceneCreated = create.ok;
        record('scene_create_scene', create.ok, abbrev(create.text));
    } catch (e) {
        record('scene_create_scene', false, e.message);
    } finally {
        if (sceneCreated) {
            const del = await callTool('project_delete_asset', { url: TEST_SCENE_PATH });
            record('project_delete_asset (scene cleanup)', del.ok, abbrev(del.text));
        }
    }

    // --- SCENE SWITCH: open Boot.scene → query → restore original
    //     Skipped if the original scene is dirty — switching would pop a
    //     "save unsaved changes?" dialog on the user. Pass --force-switch
    //     to override (will save the dirty scene first).
    let switched = false;
    try {
        const forceSwitch = process.argv.includes('--force-switch');
        // Re-check dirty NOW — earlier write-flow tests (create_node /
        // copy_node / paste_node / delete_node etc.) leave the scene
        // dirty in cocos's view even after the test's own cleanup
        // restored the node tree to its starting shape. Querying once
        // at startup misses that. Without this re-check, the scene
        // switch below pops cocos' "save unsaved changes?" dialog and
        // blocks the user.
        let dirtyNow = sceneDirtyAtStart;
        try {
            const dirtyCheck = await callTool('sceneAdvanced_query_scene_dirty', {});
            dirtyNow = dirtyCheck.structured?.data?.dirty === true;
        } catch { /* fall through to startup snapshot */ }

        if (dirtyNow && !forceSwitch) {
            const reason = sceneDirtyAtStart
                ? 'original scene was dirty at start'
                : 'live-test mutations dirtied the scene; skip to avoid Cocos save-prompt dialog (pass --force-switch to save+switch)';
            record('scene switch flow', 'skip', reason);
            throw new Error('__skip__');
        }
        if (dirtyNow && forceSwitch) {
            const saved = await callTool('scene_save_scene', {});
            record('scene_save_scene (pre-switch)', saved.ok, abbrev(saved.text));
        }
        const sceneList = await callTool('scene_get_scene_list', {});
        const bootScene = sceneList.structured?.data?.find(s => s.name === 'Boot.scene');
        if (!bootScene || !originalScenePath) {
            record('scene switch flow', 'skip', 'no Boot.scene or original path missing');
        } else {
            const open = await callTool('scene_open_scene', { scenePath: bootScene.path });
            switched = open.ok;
            record(`scene_open_scene (Boot)`, open.ok, abbrev(open.text));
            if (open.ok) {
                const cur = await callTool('scene_get_current_scene', {});
                record('current scene is Boot', cur.structured?.data?.name?.includes('Boot'),
                    `name=${cur.structured?.data?.name}  nodeCount=${cur.structured?.data?.nodeCount}`);
                const hier = await callTool('scene_get_scene_hierarchy', {});
                record('Boot scene hierarchy', hier.ok,
                    `root=${hier.structured?.data?.name}  children=${hier.structured?.data?.children?.length ?? '?'}`);
            }
        }
    } catch (e) {
        if (e?.message !== '__skip__') {
            record('scene switch flow', false, e.message);
        }
    } finally {
        if (switched && originalScenePath) {
            const restore = await callTool('scene_open_scene', { scenePath: originalScenePath });
            record(`scene_open_scene (restore ${originalSceneName})`, restore.ok, abbrev(restore.text));
        }
    }

    // --- DEBUG / VALIDATION extras
    try {
        const c = await callTool('debug_clear_console', {});
        record('debug_clear_console', c.ok || c.isError, abbrev(c.text));
    } catch (e) { record('debug_clear_console', false, e.message); }

    // --- SUMMARY
    console.log('');
    console.log(`${COLOR.pass}${results.pass} pass${COLOR.reset}  ${COLOR.fail}${results.fail} fail${COLOR.reset}  ${COLOR.warn}${results.skip} skip${COLOR.reset}  /  ${results.items.length} total`);
    if (results.fail > 0) {
        console.log('\nFailed items:');
        results.items.filter(i => i.ok === false).forEach(i => console.log(' -', i.label, '|', i.detail));
    }
    process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
