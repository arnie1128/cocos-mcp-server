import { ok, fail } from '../lib/response';
import type { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';

type WindowKind = 'focused' | 'editor' | 'simulator' | 'preview';
type MouseButton = 'left' | 'right' | 'middle';

interface WindowSelectorArgs {
    windowId?: number;
    windowKind?: WindowKind;
    titleContains?: string;
}

interface PanelPointArgs extends WindowSelectorArgs {
    panel?: string;
    x?: number;
    y?: number;
}

interface MouseMoveArgs extends PanelPointArgs {
    button?: MouseButton;
    modifiers?: string[];
}

interface MouseClickArgs extends PanelPointArgs {
    button?: MouseButton;
    clickCount?: number;
    modifiers?: string[];
}

interface MouseDragArgs extends WindowSelectorArgs {
    panel?: string;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    button?: MouseButton;
    steps?: number;
    stepDelayMs?: number;
    modifiers?: string[];
}

interface KeyPressArgs extends WindowSelectorArgs {
    panel?: string;
    keyCode: string;
    text?: string;
    modifiers?: string[];
}

const windowSelectorSchema = {
    windowId: z.number().int().optional().describe('Exact BrowserWindow id from input_list_windows; takes priority over windowKind and titleContains.'),
    windowKind: z.enum(['focused', 'editor', 'simulator', 'preview']).default('focused').describe('Target window kind. "focused" prefers the currently focused window.'),
    titleContains: z.string().optional().describe('Optional case-insensitive substring matched against the Electron BrowserWindow title.'),
};

const panelPointSchema = {
    ...windowSelectorSchema,
    panel: z.string().optional().describe('Optional editor panel name. When set, x/y are offsets from the panel center.'),
    x: z.number().default(0).describe('X coordinate, or offset from panel center when panel is set.'),
    y: z.number().default(0).describe('Y coordinate, or offset from panel center when panel is set.'),
};

const mouseButtonSchema = z.enum(['left', 'right', 'middle']).default('left');
const modifiersSchema = z.array(z.string()).default([]).describe('Electron input modifiers such as shift, control, alt, meta.');

function normalizeText(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function inferWindowKind(title: string): 'editor' | 'simulator' | 'preview' | 'unknown' {
    const normalized = normalizeText(title);
    if (normalized.includes('simulator')) {
        return 'simulator';
    }
    if (normalized.includes('preview')) {
        return 'preview';
    }
    if (normalized.includes('cocos creator') || normalized.includes('cocos')) {
        return 'editor';
    }
    return 'unknown';
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export class InputTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'list_windows',
        title: 'List Electron windows',
        description: '[specialist] List available Electron BrowserWindow targets for input simulation, including title, bounds, visibility, focus, and inferred kind.',
        inputSchema: z.object({}),
    })
    async listWindows(): Promise<ToolResponse> {
        try {
            const windows = this.getAllWindows().map((window: any, index: number) => {
                const title = typeof window.getTitle === 'function' ? window.getTitle() : '';
                return {
                    index,
                    id: typeof window.id === 'number' ? window.id : index,
                    title,
                    bounds: typeof window.getBounds === 'function' ? window.getBounds() : null,
                    visible: typeof window.isVisible === 'function' ? window.isVisible() : true,
                    focused: typeof window.isFocused === 'function' ? window.isFocused() : false,
                    kind: inferWindowKind(title),
                };
            });
            return ok({ windows, count: windows.length });
        } catch (err: any) {
            return fail(`Failed to list Electron windows: ${err?.message ?? String(err)}`);
        }
    }

    @mcpTool({
        name: 'simulate_mouse_move',
        title: 'Simulate mouse move',
        description: '[specialist] Send an Electron mouseMove input event to the focused or selected editor/preview/simulator window.',
        inputSchema: z.object({
            ...panelPointSchema,
            button: mouseButtonSchema.describe('Mouse button context for the move event. Default left.'),
            modifiers: modifiersSchema,
        }),
    })
    async simulateMouseMove(args: MouseMoveArgs): Promise<ToolResponse> {
        try {
            const window = this.pickWindow(args);
            const point = await this.focusTarget(window, args.panel, args.x, args.y);
            const button = args.button ?? 'left';
            const modifiers = this.normalizeModifiers(args.modifiers);
            window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, button, modifiers });
            return ok({
                sent: true,
                type: 'mouse_move',
                point,
                button,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        } catch (err: any) {
            return fail(`Failed to simulate mouse move: ${err?.message ?? String(err)}`);
        }
    }

    @mcpTool({
        name: 'simulate_mouse_click',
        title: 'Simulate mouse click',
        description: '[specialist] Send Electron mouseMove, mouseDown, and mouseUp input events to click in the focused or selected editor/preview/simulator window.',
        inputSchema: z.object({
            ...panelPointSchema,
            button: mouseButtonSchema.describe('Mouse button to click. Default left.'),
            clickCount: z.number().min(1).max(10).default(1).describe('Click count. Default 1.'),
            modifiers: modifiersSchema,
        }),
    })
    async simulateMouseClick(args: MouseClickArgs): Promise<ToolResponse> {
        try {
            const window = this.pickWindow(args);
            const point = await this.focusTarget(window, args.panel, args.x, args.y);
            const button = args.button ?? 'left';
            const clickCount = Math.max(1, Math.floor(args.clickCount ?? 1));
            const modifiers = this.normalizeModifiers(args.modifiers);

            window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, button, modifiers });
            window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button, clickCount, modifiers });
            window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button, clickCount, modifiers });

            return ok({
                sent: true,
                type: 'mouse_click',
                point,
                button,
                clickCount,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        } catch (err: any) {
            return fail(`Failed to simulate mouse click: ${err?.message ?? String(err)}`);
        }
    }

    @mcpTool({
        name: 'simulate_mouse_drag',
        title: 'Simulate mouse drag',
        description: '[specialist] Send Electron mouse input events for a drag gesture in the focused or selected editor/preview/simulator window.',
        inputSchema: z.object({
            ...windowSelectorSchema,
            panel: z.string().optional().describe('Optional editor panel name. When set, start/end coordinates are offsets from the panel center.'),
            startX: z.number().default(0).describe('Drag start X coordinate, or offset from panel center when panel is set.'),
            startY: z.number().default(0).describe('Drag start Y coordinate, or offset from panel center when panel is set.'),
            endX: z.number().default(0).describe('Drag end X coordinate, or offset from panel center when panel is set.'),
            endY: z.number().default(0).describe('Drag end Y coordinate, or offset from panel center when panel is set.'),
            button: mouseButtonSchema.describe('Mouse button to hold during the drag. Default left.'),
            steps: z.number().min(1).max(60).default(10).describe('Interpolated move steps between start and end. Default 10, max 60.'),
            stepDelayMs: z.number().min(0).max(1000).default(0).describe('Optional delay between drag steps in milliseconds.'),
            modifiers: modifiersSchema,
        }),
    })
    async simulateMouseDrag(args: MouseDragArgs): Promise<ToolResponse> {
        try {
            const window = this.pickWindow(args);
            const start = await this.focusTarget(window, args.panel, args.startX, args.startY);
            const end = await this.resolvePoint(window, args.panel, args.endX, args.endY);
            const steps = Math.max(1, Math.min(60, Math.floor(args.steps ?? 10)));
            const button = args.button ?? 'left';
            const modifiers = this.normalizeModifiers(args.modifiers);
            const stepDelayMs = Math.max(0, Math.floor(args.stepDelayMs ?? 0));

            window.webContents.sendInputEvent({ type: 'mouseMove', x: start.x, y: start.y, button, modifiers });
            window.webContents.sendInputEvent({ type: 'mouseDown', x: start.x, y: start.y, button, clickCount: 1, modifiers });
            for (let step = 1; step <= steps; step += 1) {
                const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
                const y = Math.round(start.y + ((end.y - start.y) * step) / steps);
                window.webContents.sendInputEvent({ type: 'mouseMove', x, y, button, modifiers });
                if (stepDelayMs > 0) {
                    await sleep(stepDelayMs);
                }
            }
            window.webContents.sendInputEvent({ type: 'mouseUp', x: end.x, y: end.y, button, clickCount: 1, modifiers });

            return ok({
                sent: true,
                type: 'mouse_drag',
                from: start,
                to: end,
                button,
                steps,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        } catch (err: any) {
            return fail(`Failed to simulate mouse drag: ${err?.message ?? String(err)}`);
        }
    }

    @mcpTool({
        name: 'simulate_key_press',
        title: 'Simulate key press',
        description: '[specialist] Send Electron keyDown/keyUp input events, optionally with a char event, to the focused or selected editor/preview/simulator window.',
        inputSchema: z.object({
            ...windowSelectorSchema,
            panel: z.string().optional().describe('Optional editor panel to focus before sending the key event.'),
            keyCode: z.string().min(1).describe('Electron keyCode to press, such as A, Enter, Escape, ArrowLeft, or Space.'),
            text: z.string().optional().describe('Optional text payload for an additional char event between keyDown and keyUp.'),
            modifiers: modifiersSchema,
        }),
    })
    async simulateKeyPress(args: KeyPressArgs): Promise<ToolResponse> {
        try {
            const window = this.pickWindow(args);
            if (typeof window.focus === 'function') {
                window.focus();
            }
            if (args.panel) {
                await this.getPanelPoint(window, args.panel, 0, 0);
            }

            const keyCode = String(args.keyCode || '').trim();
            if (!keyCode) {
                return fail('keyCode is required.');
            }

            const modifiers = this.normalizeModifiers(args.modifiers);
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
            if (args.text) {
                window.webContents.sendInputEvent({ type: 'char', keyCode: String(args.text), modifiers });
            }
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });

            return ok({
                sent: true,
                type: 'key_press',
                keyCode,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        } catch (err: any) {
            return fail(`Failed to simulate key press: ${err?.message ?? String(err)}`);
        }
    }

    private getElectron(): any {
        try {
            return require('electron');
        } catch (err: any) {
            throw new Error(`Electron APIs are unavailable: ${err?.message ?? String(err)}`);
        }
    }

    private getAllWindows(): any[] {
        const electron = this.getElectron();
        const BrowserWindow = electron.BrowserWindow;
        if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') {
            throw new Error('Electron BrowserWindow API is unavailable.');
        }
        return BrowserWindow.getAllWindows().filter((window: any) => window && !window.isDestroyed());
    }

    private pickWindow(options: WindowSelectorArgs = {}): any {
        const electron = this.getElectron();
        const BrowserWindow = electron.BrowserWindow;
        const windows = this.getAllWindows();
        if (!windows.length) {
            throw new Error('No Electron windows are available.');
        }

        if (options.windowId !== undefined) {
            const byId = windows.find((w: any) => w.id === options.windowId);
            if (!byId) throw new Error('No BrowserWindow with id=' + options.windowId + ' found.');
            return byId;
        }

        const titleContains = normalizeText(options.titleContains);
        const windowKind = normalizeText(options.windowKind || 'focused');
        const focusedWindow = BrowserWindow.getFocusedWindow && BrowserWindow.getFocusedWindow();

        const candidates = windows.filter((window: any) => {
            const title = this.getWindowTitle(window);
            const kind = inferWindowKind(title);
            const kindMatches = windowKind === 'focused'
                || windowKind === ''
                || kind === windowKind;
            const titleMatches = !titleContains || normalizeText(title).includes(titleContains);
            return kindMatches && titleMatches;
        });

        const target = (focusedWindow && candidates.includes(focusedWindow) && focusedWindow)
            || candidates.find((window: any) => typeof window.isVisible === 'function' ? window.isVisible() : true)
            || candidates[0]
            || windows[0];

        if (!target) {
            throw new Error(`No BrowserWindow matched windowKind='${windowKind}' titleContains='${titleContains}'.`);
        }
        return target;
    }

    private async focusTarget(window: any, panel: string | undefined, x: number = 0, y: number = 0): Promise<{ x: number; y: number }> {
        if (typeof window.focus === 'function') {
            window.focus();
        }
        return this.resolvePoint(window, panel, x, y);
    }

    private async resolvePoint(window: any, panel: string | undefined, x: number = 0, y: number = 0): Promise<{ x: number; y: number }> {
        if (panel) {
            return this.getPanelPoint(window, panel, x, y);
        }
        return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
    }

    private async getPanelPoint(window: any, panelName: string, offsetX: number = 0, offsetY: number = 0): Promise<{ x: number; y: number }> {
        const script = this.buildPanelFocusScript(panelName, offsetX, offsetY);
        return this.executeJavaScript(window, script);
    }

    private async executeJavaScript(window: any, script: string): Promise<any> {
        if (!window || !window.webContents || typeof window.webContents.executeJavaScript !== 'function') {
            throw new Error('Target window does not support webContents.executeJavaScript.');
        }
        return window.webContents.executeJavaScript(script, true);
    }

    private buildPanelFocusScript(panelName: string, offsetX: number, offsetY: number): string {
        return `
            (() => {
                const panelName = ${JSON.stringify(String(panelName || 'scene').toLowerCase())};
                const offsetX = ${Number(offsetX || 0)};
                const offsetY = ${Number(offsetY || 0)};
                const isVisible = (element) => {
                    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 4 && rect.height > 4;
                };
                const textOf = (element) => [
                    element.getAttribute && element.getAttribute('name'),
                    element.getAttribute && element.getAttribute('title'),
                    element.id,
                    element.className,
                    element.textContent,
                ].filter(Boolean).join(' ').toLowerCase();
                const collectAll = (root, bucket) => {
                    if (!root) return;
                    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
                    for (const node of nodes) {
                        bucket.push(node);
                        if (node.shadowRoot) collectAll(node.shadowRoot, bucket);
                    }
                };
                const all = [];
                collectAll(document, all);
                const target = all.find((element) => isVisible(element) && textOf(element).includes(panelName));
                const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
                const x = Math.floor(rect.left + rect.width / 2 + offsetX);
                const y = Math.floor(rect.top + rect.height / 2 + offsetY);
                const focusable = document.elementFromPoint(x, y) || target || document.body;
                if (focusable && typeof focusable.focus === 'function') focusable.focus();
                return { x, y };
            })();
        `;
    }

    private normalizeModifiers(modifiers: string[] | undefined): string[] {
        return Array.isArray(modifiers) ? modifiers.map(item => String(item)) : [];
    }

    private getWindowTitle(window: any): string {
        return typeof window.getTitle === 'function' ? window.getTitle() : '';
    }
}
