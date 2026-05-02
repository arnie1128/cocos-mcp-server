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
    const find = (n: Node) => {
        if (camera) return;
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
    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const dstRow = y * width * 4;
        for (let x = 0; x < width * 4; x++) {
            imageData.data[dstRow + x] = buffer[srcRow + x];
        }
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
        components: target.components.map(c => ({
            type: (c.constructor as any).name ?? 'Unknown',
            enabled: (c as any).enabled ?? null,
        })),
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
