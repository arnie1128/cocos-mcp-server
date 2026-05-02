/**
 * GameDebugClient — runtime bridge for cocos-mcp-server's debug_game_command.
 *
 * Drop this file into your cocos project's source folder (e.g.
 * `assets/scripts/mcp/cocos-mcp-client.ts`) and call
 * `initMcpDebugClient()` once during your game's startup (e.g. inside
 * the `start()` of a top-level scene component).
 *
 * The client polls the MCP server's /game/command endpoint at a fixed
 * interval, executes the command (built-in or user-supplied), and POSTs
 * the result back to /game/result. When the MCP server is offline,
 * fetch errors are caught silently — safe to ship in production builds
 * (or guard the init call behind a build-flag/dev-build check).
 *
 * Built-in command types:
 *   - "screenshot" — capture the active camera via RenderTexture, return
 *     {dataUrl, width, height}. The MCP host writes the bytes to
 *     <project>/temp/mcp-captures/.
 *   - "click" — args: {name: string}. Find a node by exact name (DFS from
 *     director.getScene()) and emit Button.EventType.CLICK.
 *   - "inspect" — args: {name: string}. Find a node by name and return
 *     {position, scale, rotation, contentSize?, anchorPoint?, layer,
 *      active, components: [{type, enabled}]}.
 *   - "record_start" — args: {mimeType?: 'video/webm'|'video/mp4',
 *     videoBitsPerSecond?: number}. Starts MediaRecorder against the
 *     game canvas (canvas.captureStream). Returns immediately with
 *     {recording: true, mimeType}. Use record_stop to retrieve the
 *     blob. Browser-only — fails on native cocos builds (the cocos
 *     editor preview / browser preview both expose canvas; native
 *     deployments don't have MediaRecorder).
 *   - "record_stop" — no args. Stops the in-progress recording, returns
 *     {dataUrl, mimeType, durationMs, sizeBytes}. The MCP host writes
 *     the bytes to <project>/temp/mcp-captures/recording-<ts>.<ext>
 *     when the result returns through debug_game_command(type=
 *     "record_stop"). Calling record_stop with no recording in flight
 *     returns success:false.
 *
 * Custom command types: pass `customCommands` to `initMcpDebugClient`.
 * Each handler receives `args` and returns `{success, data?, error?}`
 * (sync or Promise). Common patterns:
 *
 *   initMcpDebugClient({
 *     customCommands: {
 *       state:    ()         => ({ success: true, data: GameDb.dump() }),
 *       navigate: async (a) => { await Router.go(a.page); return { success: true }; },
 *     },
 *   });
 *
 * Single-flight on the host side — only one command can be pending at a
 * time. If your custom handler is slow, raise `timeoutMs` on the
 * debug_game_command tool call rather than parallelizing.
 *
 * Source: cocos-mcp-server v2.6.0+ (T-V26-1). Originally derived from
 * harady's cocos-creator-mcp McpDebugClient (MIT-licensed).
 */

import { director, Node, Button, Camera, RenderTexture, gfx } from 'cc';

export interface McpDebugClientConfig {
    /** MCP server base URL. Default 'http://127.0.0.1:3000'. */
    mcpBaseUrl?: string;
    /** Polling interval in ms. Default 500. Lowering increases CPU/network; raising adds latency. */
    pollIntervalMs?: number;
    /** User-defined commands. Keys are command type strings; values handle args and return {success, data?, error?}. */
    customCommands?: Record<string, (args: any) => any | Promise<any>>;
    /** When true, silently swallow connection errors. Default true (safe for prod builds). */
    silent?: boolean;
}

interface McpCommand {
    id: string;
    type: string;
    args?: any;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _busy = false;
let _config: Required<Omit<McpDebugClientConfig, 'customCommands'>> & { customCommands: Record<string, (args: any) => any | Promise<any>> };

async function pollOnce(): Promise<void> {
    if (_busy) return;
    _busy = true;
    try {
        const res = await fetch(`${_config.mcpBaseUrl}/game/command`);
        if (!res.ok) return;
        const cmd: McpCommand | null = await res.json();
        if (!cmd) return;

        const result = await executeCommand(cmd);
        await fetch(`${_config.mcpBaseUrl}/game/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        }).catch(() => { /* swallow per silent contract */ });
    } catch (err) {
        if (!_config.silent) console.warn('[McpDebugClient] poll error:', err);
    } finally {
        _busy = false;
    }
}

async function executeCommand(cmd: McpCommand): Promise<any> {
    try {
        switch (cmd.type) {
            case 'screenshot':
                return wrap(cmd.id, takeScreenshot());
            case 'click':
                return wrap(cmd.id, clickNode(cmd.args?.name));
            case 'inspect':
                return wrap(cmd.id, inspectNode(cmd.args?.name));
            case 'record_start':
                return wrap(cmd.id, await recordStart(cmd.args ?? {}));
            case 'record_stop':
                return wrap(cmd.id, await recordStop());
        }
        const handler = _config.customCommands[cmd.type];
        if (handler) {
            const out = await handler(cmd.args);
            return { id: cmd.id, success: out?.success ?? false, data: out?.data, error: out?.error };
        }
        return { id: cmd.id, success: false, error: `Unknown command type: ${cmd.type}` };
    } catch (err: any) {
        return { id: cmd.id, success: false, error: err?.message ?? String(err) };
    }
}

function wrap(id: string, r: { success: boolean; data?: any; error?: string }): any {
    return { id, ...r };
}

function takeScreenshot(): { success: boolean; data?: any; error?: string } {
    const scene = director.getScene();
    if (!scene) return { success: false, error: 'No active scene' };

    let camera: Camera | null = null;
    // v2.6.1 review fix (gemini 🟡): skip inactive subtrees so we don't
    // walk a hidden UI hierarchy or off-stage scratch nodes.
    const find = (n: Node) => {
        if (camera || !n.active) return;
        const c = n.getComponent(Camera);
        if (c && c.enabled) { camera = c; return; }
        for (const child of n.children) find(child);
    };
    find(scene);
    if (!camera) return { success: false, error: 'No enabled Camera in active scene' };

    const cam = camera as Camera;
    const width = Math.floor(cam.camera.width);
    const height = Math.floor(cam.camera.height);

    const rt = new RenderTexture();
    rt.reset({ width, height });

    const prevTarget = cam.targetTexture;
    cam.targetTexture = rt;
    director.root!.frameMove(0);
    cam.targetTexture = prevTarget;

    const region = new gfx.BufferTextureCopy();
    region.texOffset.x = 0;
    region.texOffset.y = 0;
    region.texExtent.width = width;
    region.texExtent.height = height;

    const buffer = new Uint8Array(width * height * 4);
    const tex = rt.getGFXTexture();
    if (!tex) {
        rt.destroy();
        return { success: false, error: 'RenderTexture has no gfx texture' };
    }
    director.root!.device.copyTextureToBuffers(tex, [buffer], [region]);

    const cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');
    if (!ctx) {
        rt.destroy();
        return { success: false, error: 'Failed to obtain 2d canvas context' };
    }
    const imageData = ctx.createImageData(width, height);
    // gfx readback is bottom-up; flip rows so the PNG is right-side up.
    // v2.6.1 review fix (gemini 🟡): per-row TypedArray copy via
    // ImageData.data.set + Uint8Array.subarray is ~10× faster than the
    // per-byte loop on large canvases (4k canvas = 8M pixels).
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * rowBytes;
        const dstRow = y * rowBytes;
        imageData.data.set(buffer.subarray(srcRow, srcRow + rowBytes), dstRow);
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = cvs.toDataURL('image/png');
    rt.destroy();
    return { success: true, data: { dataUrl, width, height } };
}

function clickNode(name?: string): { success: boolean; error?: string } {
    if (!name) return { success: false, error: 'name is required' };
    const scene = director.getScene();
    if (!scene) return { success: false, error: 'No active scene' };
    const target = findByName(scene, name);
    if (!target) return { success: false, error: `Node not found: ${name}` };
    target.emit(Button.EventType.CLICK, target);
    return { success: true };
}

function inspectNode(name?: string): { success: boolean; data?: any; error?: string } {
    if (!name) return { success: false, error: 'name is required' };
    const scene = director.getScene();
    if (!scene) return { success: false, error: 'No active scene' };
    const target = findByName(scene, name);
    if (!target) return { success: false, error: `Node not found: ${name}` };

    const pos = target.position;
    const scale = target.scale;
    const rot = target.eulerAngles;
    const data: any = {
        name: target.name,
        active: target.active,
        layer: target.layer,
        position: { x: pos.x, y: pos.y, z: pos.z },
        scale: { x: scale.x, y: scale.y, z: scale.z },
        eulerAngles: { x: rot.x, y: rot.y, z: rot.z },
        // v2.6.1 review fix (gemini 🟡): minified release builds rename
        // constructor.name (e.g. "Sprite" → "a"); fall back to the
        // ccclass-registered name when present (cocos sets it via the
        // @ccclass decorator on the class).
        components: target.components.map(c => {
            const ctor: any = c.constructor;
            const ccname = ctor?.__cid__ ?? ctor?.[Symbol.for('cc:cls:name')] ?? null;
            return {
                type: ccname ?? ctor?.name ?? 'Unknown',
                enabled: (c as any).enabled ?? null,
            };
        }),
        childCount: target.children.length,
    };
    // UITransform info when present (very common for UI nodes).
    const ui = target.getComponent('cc.UITransform') as any;
    if (ui) {
        data.contentSize = { width: ui.contentSize.width, height: ui.contentSize.height };
        data.anchorPoint = { x: ui.anchorPoint.x, y: ui.anchorPoint.y };
    }
    return { success: true, data };
}

// v2.9.x T-V29-5: MediaRecorder bridge. Records the game canvas as
// webm/mp4 and returns the assembled blob as a base64 dataUrl on stop.
//
// Single-flight: only one recording at a time per client. record_start
// while a recording is already in progress returns success:false with a
// clear message rather than overwriting state.
//
// Browser-only: relies on HTMLCanvasElement.captureStream + MediaRecorder
// APIs that are not available on native (cocos-runtime) builds. Native
// cocos deployments running this code will return a clean "MediaRecorder
// not available" error rather than crash.
//
// Resource cleanup: stop() releases the MediaRecorder + drops the stream
// tracks so cocos's frame loop isn't competing with a hidden capture
// pipeline forever if the AI never calls record_stop.
let _recState: {
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    mimeType: string;
    startedAt: number;
    stopPromise: Promise<{ dataUrl: string; mimeType: string; durationMs: number; sizeBytes: number }>;
    resolveStop: (v: { dataUrl: string; mimeType: string; durationMs: number; sizeBytes: number }) => void;
    rejectStop: (e: Error) => void;
} | null = null;

function findGameCanvas(): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    // Cocos web preview tags the canvas with id="GameCanvas" by default.
    const byId = document.getElementById('GameCanvas');
    if (byId instanceof HTMLCanvasElement) return byId;
    const all = document.getElementsByTagName('canvas');
    return all.length > 0 ? all[0] : null;
}

// v2.9.5 review fix (Codex 🔴 + Claude 🟡): centralised cleanup so all
// failure / completion paths release tracks + clear _recState exactly
// once. Idempotent — multiple calls are safe.
function cleanupRecording(stream?: MediaStream): void {
    if (stream) {
        try { stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    }
    _recState = null;
}

async function recordStart(args: { mimeType?: string; videoBitsPerSecond?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (_recState) {
        return { success: false, error: 'A recording is already in progress; call record_stop first.' };
    }
    if (typeof MediaRecorder === 'undefined') {
        return { success: false, error: 'MediaRecorder API not available — record_start requires a browser/PIE preview environment, not a native cocos build.' };
    }
    const canvas = findGameCanvas();
    if (!canvas) {
        return { success: false, error: 'No <canvas> element found in document — game canvas may not have mounted yet.' };
    }
    if (typeof (canvas as any).captureStream !== 'function') {
        return { success: false, error: 'canvas.captureStream() not supported in this browser.' };
    }
    const stream: MediaStream = (canvas as any).captureStream();
    const mimeType = args.mimeType ?? (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4');
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        // v2.9.5 review fix (Codex 🔴): release the stream we just opened
        // before bailing on unsupported mimeType.
        cleanupRecording(stream);
        return { success: false, error: `mimeType "${mimeType}" not supported by this browser's MediaRecorder.` };
    }
    let recorder: MediaRecorder;
    try {
        recorder = new MediaRecorder(stream, {
            mimeType,
            ...(args.videoBitsPerSecond ? { videoBitsPerSecond: args.videoBitsPerSecond } : {}),
        });
    } catch (err: any) {
        cleanupRecording(stream);
        return { success: false, error: `MediaRecorder init failed: ${err?.message ?? String(err)}` };
    }
    const chunks: Blob[] = [];
    let resolveStop!: (v: { dataUrl: string; mimeType: string; durationMs: number; sizeBytes: number }) => void;
    let rejectStop!: (e: Error) => void;
    const stopPromise = new Promise<{ dataUrl: string; mimeType: string; durationMs: number; sizeBytes: number }>((resolve, reject) => {
        resolveStop = resolve;
        rejectStop = reject;
    });
    // v2.9.5 review fix (Claude 🔴): capture startedAt in closure, NOT
    // via _recState. recordStop nulls _recState before awaiting the
    // stop promise; if onstop reads _recState?.startedAt it gets null
    // and durationMs collapses to 0. Closure read is timing-safe.
    const startedAt = Date.now();
    recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
        try {
            const blob = new Blob(chunks, { type: mimeType });
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('FileReader failed to encode recording'));
                reader.readAsDataURL(blob);
            });
            const durationMs = Date.now() - startedAt;
            cleanupRecording(stream);
            resolveStop({ dataUrl, mimeType, durationMs, sizeBytes: blob.size });
        } catch (err: any) {
            cleanupRecording(stream);
            rejectStop(err instanceof Error ? err : new Error(String(err)));
        }
    };
    recorder.onerror = (e: any) => {
        // v2.9.5 review fix (Codex 🔴): onerror previously rejected the
        // promise but left _recState pointing at the dead recorder and
        // never released stream tracks. Subsequent record_start would
        // refuse on stale _recState; subsequent record_stop would call
        // stop() on an errored recorder (no-op or throw) and the stream
        // would never release. Centralised cleanup fixes both.
        cleanupRecording(stream);
        rejectStop(e?.error ?? new Error('MediaRecorder error'));
    };
    try {
        recorder.start();
    } catch (err: any) {
        // v2.9.5 review fix (Claude 🟡): recorder.start() can throw on
        // some browsers if the canvas hasn't produced a frame yet.
        // Release the stream and surface a clean error envelope.
        cleanupRecording(stream);
        return { success: false, error: `MediaRecorder.start failed: ${err?.message ?? String(err)}` };
    }
    _recState = { recorder, stream, chunks, mimeType, startedAt, stopPromise, resolveStop, rejectStop };
    return { success: true, data: { recording: true, mimeType } };
}

async function recordStop(): Promise<{ success: boolean; data?: any; error?: string }> {
    const st = _recState;
    if (!st) {
        return { success: false, error: 'No recording in progress. Call record_start first.' };
    }
    // v2.9.5 review fix (Claude 🔴): do NOT clear _recState before
    // awaiting stopPromise. The clear happens inside onstop /
    // onerror via cleanupRecording(), which is the single point of
    // truth for state release. This also lets onstop read state
    // through st in the closure if it ever needs to.
    try {
        st.recorder.requestData?.();
        st.recorder.stop();
    } catch (err: any) {
        cleanupRecording(st.stream);
        return { success: false, error: `MediaRecorder.stop failed: ${err?.message ?? String(err)}` };
    }
    try {
        const result = await st.stopPromise;
        return { success: true, data: result };
    } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) };
    }
}

function findByName(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = findByName(child, name);
        if (found) return found;
    }
    return null;
}

export function initMcpDebugClient(config?: McpDebugClientConfig): void {
    if (_pollTimer) return;
    _config = {
        mcpBaseUrl: config?.mcpBaseUrl ?? 'http://127.0.0.1:3000',
        pollIntervalMs: config?.pollIntervalMs ?? 500,
        customCommands: config?.customCommands ?? {},
        silent: config?.silent ?? true,
    };
    _pollTimer = setInterval(pollOnce, _config.pollIntervalMs);
    if (!_config.silent) console.log('[McpDebugClient] initialized', _config.mcpBaseUrl);
}

export function stopMcpDebugClient(): void {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}
