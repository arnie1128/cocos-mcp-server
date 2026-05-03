"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const windowSelectorSchema = {
    windowId: schema_1.z.number().int().optional().describe('Exact BrowserWindow id from input_list_windows; takes priority over windowKind and titleContains.'),
    windowKind: schema_1.z.enum(['focused', 'editor', 'simulator', 'preview']).default('focused').describe('Target window kind. "focused" prefers the currently focused window.'),
    titleContains: schema_1.z.string().optional().describe('Optional case-insensitive substring matched against the Electron BrowserWindow title.'),
};
const panelPointSchema = Object.assign(Object.assign({}, windowSelectorSchema), { panel: schema_1.z.string().optional().describe('Optional editor panel name. When set, x/y are offsets from the panel center.'), x: schema_1.z.number().default(0).describe('X coordinate, or offset from panel center when panel is set.'), y: schema_1.z.number().default(0).describe('Y coordinate, or offset from panel center when panel is set.') });
const mouseButtonSchema = schema_1.z.enum(['left', 'right', 'middle']).default('left');
const modifiersSchema = schema_1.z.array(schema_1.z.string()).default([]).describe('Electron input modifiers such as shift, control, alt, meta.');
function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}
function inferWindowKind(title) {
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
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
class InputTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async listWindows() {
        var _a;
        try {
            const windows = this.getAllWindows().map((window, index) => {
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
            return (0, response_1.ok)({ windows, count: windows.length });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to list Electron windows: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
    }
    async simulateMouseMove(args) {
        var _a, _b;
        try {
            const window = this.pickWindow(args);
            const point = await this.focusTarget(window, args.panel, args.x, args.y);
            const button = (_a = args.button) !== null && _a !== void 0 ? _a : 'left';
            const modifiers = this.normalizeModifiers(args.modifiers);
            window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, button, modifiers });
            return (0, response_1.ok)({
                sent: true,
                type: 'mouse_move',
                point,
                button,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to simulate mouse move: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}`);
        }
    }
    async simulateMouseClick(args) {
        var _a, _b, _c;
        try {
            const window = this.pickWindow(args);
            const point = await this.focusTarget(window, args.panel, args.x, args.y);
            const button = (_a = args.button) !== null && _a !== void 0 ? _a : 'left';
            const clickCount = Math.max(1, Math.floor((_b = args.clickCount) !== null && _b !== void 0 ? _b : 1));
            const modifiers = this.normalizeModifiers(args.modifiers);
            window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, button, modifiers });
            window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button, clickCount, modifiers });
            window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button, clickCount, modifiers });
            return (0, response_1.ok)({
                sent: true,
                type: 'mouse_click',
                point,
                button,
                clickCount,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to simulate mouse click: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}`);
        }
    }
    async simulateMouseDrag(args) {
        var _a, _b, _c, _d;
        try {
            const window = this.pickWindow(args);
            const start = await this.focusTarget(window, args.panel, args.startX, args.startY);
            const end = await this.resolvePoint(window, args.panel, args.endX, args.endY);
            const steps = Math.max(1, Math.min(60, Math.floor((_a = args.steps) !== null && _a !== void 0 ? _a : 10)));
            const button = (_b = args.button) !== null && _b !== void 0 ? _b : 'left';
            const modifiers = this.normalizeModifiers(args.modifiers);
            const stepDelayMs = Math.max(0, Math.floor((_c = args.stepDelayMs) !== null && _c !== void 0 ? _c : 0));
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
            return (0, response_1.ok)({
                sent: true,
                type: 'mouse_drag',
                from: start,
                to: end,
                button,
                steps,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to simulate mouse drag: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`);
        }
    }
    async simulateKeyPress(args) {
        var _a;
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
                return (0, response_1.fail)('keyCode is required.');
            }
            const modifiers = this.normalizeModifiers(args.modifiers);
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
            if (args.text) {
                window.webContents.sendInputEvent({ type: 'char', keyCode: String(args.text), modifiers });
            }
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
            return (0, response_1.ok)({
                sent: true,
                type: 'key_press',
                keyCode,
                modifiers,
                windowTitle: this.getWindowTitle(window),
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to simulate key press: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
    }
    getElectron() {
        var _a;
        try {
            return require('electron');
        }
        catch (err) {
            throw new Error(`Electron APIs are unavailable: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
    }
    getAllWindows() {
        const electron = this.getElectron();
        const BrowserWindow = electron.BrowserWindow;
        if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') {
            throw new Error('Electron BrowserWindow API is unavailable.');
        }
        return BrowserWindow.getAllWindows().filter((window) => window && !window.isDestroyed());
    }
    pickWindow(options = {}) {
        const electron = this.getElectron();
        const BrowserWindow = electron.BrowserWindow;
        const windows = this.getAllWindows();
        if (!windows.length) {
            throw new Error('No Electron windows are available.');
        }
        if (options.windowId !== undefined) {
            const byId = windows.find((w) => w.id === options.windowId);
            if (!byId)
                throw new Error('No BrowserWindow with id=' + options.windowId + ' found.');
            return byId;
        }
        const titleContains = normalizeText(options.titleContains);
        const windowKind = normalizeText(options.windowKind || 'focused');
        const focusedWindow = BrowserWindow.getFocusedWindow && BrowserWindow.getFocusedWindow();
        const candidates = windows.filter((window) => {
            const title = this.getWindowTitle(window);
            const kind = inferWindowKind(title);
            const kindMatches = windowKind === 'focused'
                || windowKind === ''
                || kind === windowKind;
            const titleMatches = !titleContains || normalizeText(title).includes(titleContains);
            return kindMatches && titleMatches;
        });
        const target = (focusedWindow && candidates.includes(focusedWindow) && focusedWindow)
            || candidates.find((window) => typeof window.isVisible === 'function' ? window.isVisible() : true)
            || candidates[0]
            || windows[0];
        if (!target) {
            throw new Error(`No BrowserWindow matched windowKind='${windowKind}' titleContains='${titleContains}'.`);
        }
        return target;
    }
    async focusTarget(window, panel, x = 0, y = 0) {
        if (typeof window.focus === 'function') {
            window.focus();
        }
        return this.resolvePoint(window, panel, x, y);
    }
    async resolvePoint(window, panel, x = 0, y = 0) {
        if (panel) {
            return this.getPanelPoint(window, panel, x, y);
        }
        return { x: Math.floor(x || 0), y: Math.floor(y || 0) };
    }
    async getPanelPoint(window, panelName, offsetX = 0, offsetY = 0) {
        const script = this.buildPanelFocusScript(panelName, offsetX, offsetY);
        return this.executeJavaScript(window, script);
    }
    async executeJavaScript(window, script) {
        if (!window || !window.webContents || typeof window.webContents.executeJavaScript !== 'function') {
            throw new Error('Target window does not support webContents.executeJavaScript.');
        }
        return window.webContents.executeJavaScript(script, true);
    }
    buildPanelFocusScript(panelName, offsetX, offsetY) {
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
    normalizeModifiers(modifiers) {
        return Array.isArray(modifiers) ? modifiers.map(item => String(item)) : [];
    }
    getWindowTitle(window) {
        return typeof window.getTitle === 'function' ? window.getTitle() : '';
    }
}
exports.InputTools = InputTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'list_windows',
        title: 'List Electron windows',
        description: '[specialist] List available Electron BrowserWindow targets for input simulation, including title, bounds, visibility, focus, and inferred kind.',
        inputSchema: schema_1.z.object({}),
    })
], InputTools.prototype, "listWindows", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'simulate_mouse_move',
        title: 'Simulate mouse move',
        description: '[specialist] Send an Electron mouseMove input event to the focused or selected editor/preview/simulator window.',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, panelPointSchema), { button: mouseButtonSchema.describe('Mouse button context for the move event. Default left.'), modifiers: modifiersSchema })),
    })
], InputTools.prototype, "simulateMouseMove", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'simulate_mouse_click',
        title: 'Simulate mouse click',
        description: '[specialist] Send Electron mouseMove, mouseDown, and mouseUp input events to click in the focused or selected editor/preview/simulator window.',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, panelPointSchema), { button: mouseButtonSchema.describe('Mouse button to click. Default left.'), clickCount: schema_1.z.number().min(1).max(10).default(1).describe('Click count. Default 1.'), modifiers: modifiersSchema })),
    })
], InputTools.prototype, "simulateMouseClick", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'simulate_mouse_drag',
        title: 'Simulate mouse drag',
        description: '[specialist] Send Electron mouse input events for a drag gesture in the focused or selected editor/preview/simulator window.',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, windowSelectorSchema), { panel: schema_1.z.string().optional().describe('Optional editor panel name. When set, start/end coordinates are offsets from the panel center.'), startX: schema_1.z.number().default(0).describe('Drag start X coordinate, or offset from panel center when panel is set.'), startY: schema_1.z.number().default(0).describe('Drag start Y coordinate, or offset from panel center when panel is set.'), endX: schema_1.z.number().default(0).describe('Drag end X coordinate, or offset from panel center when panel is set.'), endY: schema_1.z.number().default(0).describe('Drag end Y coordinate, or offset from panel center when panel is set.'), button: mouseButtonSchema.describe('Mouse button to hold during the drag. Default left.'), steps: schema_1.z.number().min(1).max(60).default(10).describe('Interpolated move steps between start and end. Default 10, max 60.'), stepDelayMs: schema_1.z.number().min(0).max(1000).default(0).describe('Optional delay between drag steps in milliseconds.'), modifiers: modifiersSchema })),
    })
], InputTools.prototype, "simulateMouseDrag", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'simulate_key_press',
        title: 'Simulate key press',
        description: '[specialist] Send Electron keyDown/keyUp input events, optionally with a char event, to the focused or selected editor/preview/simulator window.',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, windowSelectorSchema), { panel: schema_1.z.string().optional().describe('Optional editor panel to focus before sending the key event.'), keyCode: schema_1.z.string().min(1).describe('Electron keyCode to press, such as A, Enter, Escape, ArrowLeft, or Space.'), text: schema_1.z.string().optional().describe('Optional text payload for an additional char event between keyDown and keyUp.'), modifiers: modifiersSchema })),
    })
], InputTools.prototype, "simulateKeyPress", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5wdXQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvaW5wdXQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUErQ3ZFLE1BQU0sb0JBQW9CLEdBQUc7SUFDekIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUdBQW1HLENBQUM7SUFDbkosVUFBVSxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMscUVBQXFFLENBQUM7SUFDcEssYUFBYSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsdUZBQXVGLENBQUM7Q0FDekksQ0FBQztBQUVGLE1BQU0sZ0JBQWdCLG1DQUNmLG9CQUFvQixLQUN2QixLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw4RUFBOEUsQ0FBQyxFQUNySCxDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsOERBQThELENBQUMsRUFDakcsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLDhEQUE4RCxDQUFDLEdBQ3BHLENBQUM7QUFFRixNQUFNLGlCQUFpQixHQUFHLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FB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Q29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5cbnR5cGUgV2luZG93S2luZCA9ICdmb2N1c2VkJyB8ICdlZGl0b3InIHwgJ3NpbXVsYXRvcicgfCAncHJldmlldyc7XG50eXBlIE1vdXNlQnV0dG9uID0gJ2xlZnQnIHwgJ3JpZ2h0JyB8ICdtaWRkbGUnO1xuXG5pbnRlcmZhY2UgV2luZG93U2VsZWN0b3JBcmdzIHtcbiAgICB3aW5kb3dJZD86IG51bWJlcjtcbiAgICB3aW5kb3dLaW5kPzogV2luZG93S2luZDtcbiAgICB0aXRsZUNvbnRhaW5zPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGFuZWxQb2ludEFyZ3MgZXh0ZW5kcyBXaW5kb3dTZWxlY3RvckFyZ3Mge1xuICAgIHBhbmVsPzogc3RyaW5nO1xuICAgIHg/OiBudW1iZXI7XG4gICAgeT86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIE1vdXNlTW92ZUFyZ3MgZXh0ZW5kcyBQYW5lbFBvaW50QXJncyB7XG4gICAgYnV0dG9uPzogTW91c2VCdXR0b247XG4gICAgbW9kaWZpZXJzPzogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBNb3VzZUNsaWNrQXJncyBleHRlbmRzIFBhbmVsUG9pbnRBcmdzIHtcbiAgICBidXR0b24/OiBNb3VzZUJ1dHRvbjtcbiAgICBjbGlja0NvdW50PzogbnVtYmVyO1xuICAgIG1vZGlmaWVycz86IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTW91c2VEcmFnQXJncyBleHRlbmRzIFdpbmRvd1NlbGVjdG9yQXJncyB7XG4gICAgcGFuZWw/OiBzdHJpbmc7XG4gICAgc3RhcnRYPzogbnVtYmVyO1xuICAgIHN0YXJ0WT86IG51bWJlcjtcbiAgICBlbmRYPzogbnVtYmVyO1xuICAgIGVuZFk/OiBudW1iZXI7XG4gICAgYnV0dG9uPzogTW91c2VCdXR0b247XG4gICAgc3RlcHM/OiBudW1iZXI7XG4gICAgc3RlcERlbGF5TXM/OiBudW1iZXI7XG4gICAgbW9kaWZpZXJzPzogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBLZXlQcmVzc0FyZ3MgZXh0ZW5kcyBXaW5kb3dTZWxlY3RvckFyZ3Mge1xuICAgIHBhbmVsPzogc3RyaW5nO1xuICAgIGtleUNvZGU6IHN0cmluZztcbiAgICB0ZXh0Pzogc3RyaW5nO1xuICAgIG1vZGlmaWVycz86IHN0cmluZ1tdO1xufVxuXG5jb25zdCB3aW5kb3dTZWxlY3RvclNjaGVtYSA9IHtcbiAgICB3aW5kb3dJZDogei5udW1iZXIoKS5pbnQoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFeGFjdCBCcm93c2VyV2luZG93IGlkIGZyb20gaW5wdXRfbGlzdF93aW5kb3dzOyB0YWtlcyBwcmlvcml0eSBvdmVyIHdpbmRvd0tpbmQgYW5kIHRpdGxlQ29udGFpbnMuJyksXG4gICAgd2luZG93S2luZDogei5lbnVtKFsnZm9jdXNlZCcsICdlZGl0b3InLCAnc2ltdWxhdG9yJywgJ3ByZXZpZXcnXSkuZGVmYXVsdCgnZm9jdXNlZCcpLmRlc2NyaWJlKCdUYXJnZXQgd2luZG93IGtpbmQuIFwiZm9jdXNlZFwiIHByZWZlcnMgdGhlIGN1cnJlbnRseSBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICB0aXRsZUNvbnRhaW5zOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIGNhc2UtaW5zZW5zaXRpdmUgc3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB0aGUgRWxlY3Ryb24gQnJvd3NlcldpbmRvdyB0aXRsZS4nKSxcbn07XG5cbmNvbnN0IHBhbmVsUG9pbnRTY2hlbWEgPSB7XG4gICAgLi4ud2luZG93U2VsZWN0b3JTY2hlbWEsXG4gICAgcGFuZWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgZWRpdG9yIHBhbmVsIG5hbWUuIFdoZW4gc2V0LCB4L3kgYXJlIG9mZnNldHMgZnJvbSB0aGUgcGFuZWwgY2VudGVyLicpLFxuICAgIHg6IHoubnVtYmVyKCkuZGVmYXVsdCgwKS5kZXNjcmliZSgnWCBjb29yZGluYXRlLCBvciBvZmZzZXQgZnJvbSBwYW5lbCBjZW50ZXIgd2hlbiBwYW5lbCBpcyBzZXQuJyksXG4gICAgeTogei5udW1iZXIoKS5kZWZhdWx0KDApLmRlc2NyaWJlKCdZIGNvb3JkaW5hdGUsIG9yIG9mZnNldCBmcm9tIHBhbmVsIGNlbnRlciB3aGVuIHBhbmVsIGlzIHNldC4nKSxcbn07XG5cbmNvbnN0IG1vdXNlQnV0dG9uU2NoZW1hID0gei5lbnVtKFsnbGVmdCcsICdyaWdodCcsICdtaWRkbGUnXSkuZGVmYXVsdCgnbGVmdCcpO1xuY29uc3QgbW9kaWZpZXJzU2NoZW1hID0gei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnRWxlY3Ryb24gaW5wdXQgbW9kaWZpZXJzIHN1Y2ggYXMgc2hpZnQsIGNvbnRyb2wsIGFsdCwgbWV0YS4nKTtcblxuZnVuY3Rpb24gbm9ybWFsaXplVGV4dCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG59XG5cbmZ1bmN0aW9uIGluZmVyV2luZG93S2luZCh0aXRsZTogc3RyaW5nKTogJ2VkaXRvcicgfCAnc2ltdWxhdG9yJyB8ICdwcmV2aWV3JyB8ICd1bmtub3duJyB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVRleHQodGl0bGUpO1xuICAgIGlmIChub3JtYWxpemVkLmluY2x1ZGVzKCdzaW11bGF0b3InKSkge1xuICAgICAgICByZXR1cm4gJ3NpbXVsYXRvcic7XG4gICAgfVxuICAgIGlmIChub3JtYWxpemVkLmluY2x1ZGVzKCdwcmV2aWV3JykpIHtcbiAgICAgICAgcmV0dXJuICdwcmV2aWV3JztcbiAgICB9XG4gICAgaWYgKG5vcm1hbGl6ZWQuaW5jbHVkZXMoJ2NvY29zIGNyZWF0b3InKSB8fCBub3JtYWxpemVkLmluY2x1ZGVzKCdjb2NvcycpKSB7XG4gICAgICAgIHJldHVybiAnZWRpdG9yJztcbiAgICB9XG4gICAgcmV0dXJuICd1bmtub3duJztcbn1cblxuZnVuY3Rpb24gc2xlZXAobWlsbGlzZWNvbmRzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1pbGxpc2Vjb25kcykpO1xufVxuXG5leHBvcnQgY2xhc3MgSW5wdXRUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X3dpbmRvd3MnLFxuICAgICAgICB0aXRsZTogJ0xpc3QgRWxlY3Ryb24gd2luZG93cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgYXZhaWxhYmxlIEVsZWN0cm9uIEJyb3dzZXJXaW5kb3cgdGFyZ2V0cyBmb3IgaW5wdXQgc2ltdWxhdGlvbiwgaW5jbHVkaW5nIHRpdGxlLCBib3VuZHMsIHZpc2liaWxpdHksIGZvY3VzLCBhbmQgaW5mZXJyZWQga2luZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgbGlzdFdpbmRvd3MoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvd3MgPSB0aGlzLmdldEFsbFdpbmRvd3MoKS5tYXAoKHdpbmRvdzogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSB0eXBlb2Ygd2luZG93LmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luZG93LmdldFRpdGxlKCkgOiAnJztcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgaWQ6IHR5cGVvZiB3aW5kb3cuaWQgPT09ICdudW1iZXInID8gd2luZG93LmlkIDogaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgICAgICAgICAgICBib3VuZHM6IHR5cGVvZiB3aW5kb3cuZ2V0Qm91bmRzID09PSAnZnVuY3Rpb24nID8gd2luZG93LmdldEJvdW5kcygpIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdHlwZW9mIHdpbmRvdy5pc1Zpc2libGUgPT09ICdmdW5jdGlvbicgPyB3aW5kb3cuaXNWaXNpYmxlKCkgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBmb2N1c2VkOiB0eXBlb2Ygd2luZG93LmlzRm9jdXNlZCA9PT0gJ2Z1bmN0aW9uJyA/IHdpbmRvdy5pc0ZvY3VzZWQoKSA6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBraW5kOiBpbmZlcldpbmRvd0tpbmQodGl0bGUpLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHdpbmRvd3MsIGNvdW50OiB3aW5kb3dzLmxlbmd0aCB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gbGlzdCBFbGVjdHJvbiB3aW5kb3dzOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NpbXVsYXRlX21vdXNlX21vdmUnLFxuICAgICAgICB0aXRsZTogJ1NpbXVsYXRlIG1vdXNlIG1vdmUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZW5kIGFuIEVsZWN0cm9uIG1vdXNlTW92ZSBpbnB1dCBldmVudCB0byB0aGUgZm9jdXNlZCBvciBzZWxlY3RlZCBlZGl0b3IvcHJldmlldy9zaW11bGF0b3Igd2luZG93LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAuLi5wYW5lbFBvaW50U2NoZW1hLFxuICAgICAgICAgICAgYnV0dG9uOiBtb3VzZUJ1dHRvblNjaGVtYS5kZXNjcmliZSgnTW91c2UgYnV0dG9uIGNvbnRleHQgZm9yIHRoZSBtb3ZlIGV2ZW50LiBEZWZhdWx0IGxlZnQuJyksXG4gICAgICAgICAgICBtb2RpZmllcnM6IG1vZGlmaWVyc1NjaGVtYSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzaW11bGF0ZU1vdXNlTW92ZShhcmdzOiBNb3VzZU1vdmVBcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IHRoaXMucGlja1dpbmRvdyhhcmdzKTtcbiAgICAgICAgICAgIGNvbnN0IHBvaW50ID0gYXdhaXQgdGhpcy5mb2N1c1RhcmdldCh3aW5kb3csIGFyZ3MucGFuZWwsIGFyZ3MueCwgYXJncy55KTtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbiA9IGFyZ3MuYnV0dG9uID8/ICdsZWZ0JztcbiAgICAgICAgICAgIGNvbnN0IG1vZGlmaWVycyA9IHRoaXMubm9ybWFsaXplTW9kaWZpZXJzKGFyZ3MubW9kaWZpZXJzKTtcbiAgICAgICAgICAgIHdpbmRvdy53ZWJDb250ZW50cy5zZW5kSW5wdXRFdmVudCh7IHR5cGU6ICdtb3VzZU1vdmUnLCB4OiBwb2ludC54LCB5OiBwb2ludC55LCBidXR0b24sIG1vZGlmaWVycyB9KTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgc2VudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB0eXBlOiAnbW91c2VfbW92ZScsXG4gICAgICAgICAgICAgICAgcG9pbnQsXG4gICAgICAgICAgICAgICAgYnV0dG9uLFxuICAgICAgICAgICAgICAgIG1vZGlmaWVycyxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdGhpcy5nZXRXaW5kb3dUaXRsZSh3aW5kb3cpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHNpbXVsYXRlIG1vdXNlIG1vdmU6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2ltdWxhdGVfbW91c2VfY2xpY2snLFxuICAgICAgICB0aXRsZTogJ1NpbXVsYXRlIG1vdXNlIGNsaWNrJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VuZCBFbGVjdHJvbiBtb3VzZU1vdmUsIG1vdXNlRG93biwgYW5kIG1vdXNlVXAgaW5wdXQgZXZlbnRzIHRvIGNsaWNrIGluIHRoZSBmb2N1c2VkIG9yIHNlbGVjdGVkIGVkaXRvci9wcmV2aWV3L3NpbXVsYXRvciB3aW5kb3cuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnBhbmVsUG9pbnRTY2hlbWEsXG4gICAgICAgICAgICBidXR0b246IG1vdXNlQnV0dG9uU2NoZW1hLmRlc2NyaWJlKCdNb3VzZSBidXR0b24gdG8gY2xpY2suIERlZmF1bHQgbGVmdC4nKSxcbiAgICAgICAgICAgIGNsaWNrQ291bnQ6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMCkuZGVmYXVsdCgxKS5kZXNjcmliZSgnQ2xpY2sgY291bnQuIERlZmF1bHQgMS4nKSxcbiAgICAgICAgICAgIG1vZGlmaWVyczogbW9kaWZpZXJzU2NoZW1hLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNpbXVsYXRlTW91c2VDbGljayhhcmdzOiBNb3VzZUNsaWNrQXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3cgPSB0aGlzLnBpY2tXaW5kb3coYXJncyk7XG4gICAgICAgICAgICBjb25zdCBwb2ludCA9IGF3YWl0IHRoaXMuZm9jdXNUYXJnZXQod2luZG93LCBhcmdzLnBhbmVsLCBhcmdzLngsIGFyZ3MueSk7XG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSBhcmdzLmJ1dHRvbiA/PyAnbGVmdCc7XG4gICAgICAgICAgICBjb25zdCBjbGlja0NvdW50ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihhcmdzLmNsaWNrQ291bnQgPz8gMSkpO1xuICAgICAgICAgICAgY29uc3QgbW9kaWZpZXJzID0gdGhpcy5ub3JtYWxpemVNb2RpZmllcnMoYXJncy5tb2RpZmllcnMpO1xuXG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAnbW91c2VNb3ZlJywgeDogcG9pbnQueCwgeTogcG9pbnQueSwgYnV0dG9uLCBtb2RpZmllcnMgfSk7XG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAnbW91c2VEb3duJywgeDogcG9pbnQueCwgeTogcG9pbnQueSwgYnV0dG9uLCBjbGlja0NvdW50LCBtb2RpZmllcnMgfSk7XG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAnbW91c2VVcCcsIHg6IHBvaW50LngsIHk6IHBvaW50LnksIGJ1dHRvbiwgY2xpY2tDb3VudCwgbW9kaWZpZXJzIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHNlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgdHlwZTogJ21vdXNlX2NsaWNrJyxcbiAgICAgICAgICAgICAgICBwb2ludCxcbiAgICAgICAgICAgICAgICBidXR0b24sXG4gICAgICAgICAgICAgICAgY2xpY2tDb3VudCxcbiAgICAgICAgICAgICAgICBtb2RpZmllcnMsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHRoaXMuZ2V0V2luZG93VGl0bGUod2luZG93KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBzaW11bGF0ZSBtb3VzZSBjbGljazogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzaW11bGF0ZV9tb3VzZV9kcmFnJyxcbiAgICAgICAgdGl0bGU6ICdTaW11bGF0ZSBtb3VzZSBkcmFnJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VuZCBFbGVjdHJvbiBtb3VzZSBpbnB1dCBldmVudHMgZm9yIGEgZHJhZyBnZXN0dXJlIGluIHRoZSBmb2N1c2VkIG9yIHNlbGVjdGVkIGVkaXRvci9wcmV2aWV3L3NpbXVsYXRvciB3aW5kb3cuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIC4uLndpbmRvd1NlbGVjdG9yU2NoZW1hLFxuICAgICAgICAgICAgcGFuZWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgZWRpdG9yIHBhbmVsIG5hbWUuIFdoZW4gc2V0LCBzdGFydC9lbmQgY29vcmRpbmF0ZXMgYXJlIG9mZnNldHMgZnJvbSB0aGUgcGFuZWwgY2VudGVyLicpLFxuICAgICAgICAgICAgc3RhcnRYOiB6Lm51bWJlcigpLmRlZmF1bHQoMCkuZGVzY3JpYmUoJ0RyYWcgc3RhcnQgWCBjb29yZGluYXRlLCBvciBvZmZzZXQgZnJvbSBwYW5lbCBjZW50ZXIgd2hlbiBwYW5lbCBpcyBzZXQuJyksXG4gICAgICAgICAgICBzdGFydFk6IHoubnVtYmVyKCkuZGVmYXVsdCgwKS5kZXNjcmliZSgnRHJhZyBzdGFydCBZIGNvb3JkaW5hdGUsIG9yIG9mZnNldCBmcm9tIHBhbmVsIGNlbnRlciB3aGVuIHBhbmVsIGlzIHNldC4nKSxcbiAgICAgICAgICAgIGVuZFg6IHoubnVtYmVyKCkuZGVmYXVsdCgwKS5kZXNjcmliZSgnRHJhZyBlbmQgWCBjb29yZGluYXRlLCBvciBvZmZzZXQgZnJvbSBwYW5lbCBjZW50ZXIgd2hlbiBwYW5lbCBpcyBzZXQuJyksXG4gICAgICAgICAgICBlbmRZOiB6Lm51bWJlcigpLmRlZmF1bHQoMCkuZGVzY3JpYmUoJ0RyYWcgZW5kIFkgY29vcmRpbmF0ZSwgb3Igb2Zmc2V0IGZyb20gcGFuZWwgY2VudGVyIHdoZW4gcGFuZWwgaXMgc2V0LicpLFxuICAgICAgICAgICAgYnV0dG9uOiBtb3VzZUJ1dHRvblNjaGVtYS5kZXNjcmliZSgnTW91c2UgYnV0dG9uIHRvIGhvbGQgZHVyaW5nIHRoZSBkcmFnLiBEZWZhdWx0IGxlZnQuJyksXG4gICAgICAgICAgICBzdGVwczogei5udW1iZXIoKS5taW4oMSkubWF4KDYwKS5kZWZhdWx0KDEwKS5kZXNjcmliZSgnSW50ZXJwb2xhdGVkIG1vdmUgc3RlcHMgYmV0d2VlbiBzdGFydCBhbmQgZW5kLiBEZWZhdWx0IDEwLCBtYXggNjAuJyksXG4gICAgICAgICAgICBzdGVwRGVsYXlNczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwMDApLmRlZmF1bHQoMCkuZGVzY3JpYmUoJ09wdGlvbmFsIGRlbGF5IGJldHdlZW4gZHJhZyBzdGVwcyBpbiBtaWxsaXNlY29uZHMuJyksXG4gICAgICAgICAgICBtb2RpZmllcnM6IG1vZGlmaWVyc1NjaGVtYSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzaW11bGF0ZU1vdXNlRHJhZyhhcmdzOiBNb3VzZURyYWdBcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IHRoaXMucGlja1dpbmRvdyhhcmdzKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gYXdhaXQgdGhpcy5mb2N1c1RhcmdldCh3aW5kb3csIGFyZ3MucGFuZWwsIGFyZ3Muc3RhcnRYLCBhcmdzLnN0YXJ0WSk7XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBhd2FpdCB0aGlzLnJlc29sdmVQb2ludCh3aW5kb3csIGFyZ3MucGFuZWwsIGFyZ3MuZW5kWCwgYXJncy5lbmRZKTtcbiAgICAgICAgICAgIGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgoMSwgTWF0aC5taW4oNjAsIE1hdGguZmxvb3IoYXJncy5zdGVwcyA/PyAxMCkpKTtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbiA9IGFyZ3MuYnV0dG9uID8/ICdsZWZ0JztcbiAgICAgICAgICAgIGNvbnN0IG1vZGlmaWVycyA9IHRoaXMubm9ybWFsaXplTW9kaWZpZXJzKGFyZ3MubW9kaWZpZXJzKTtcbiAgICAgICAgICAgIGNvbnN0IHN0ZXBEZWxheU1zID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcihhcmdzLnN0ZXBEZWxheU1zID8/IDApKTtcblxuICAgICAgICAgICAgd2luZG93LndlYkNvbnRlbnRzLnNlbmRJbnB1dEV2ZW50KHsgdHlwZTogJ21vdXNlTW92ZScsIHg6IHN0YXJ0LngsIHk6IHN0YXJ0LnksIGJ1dHRvbiwgbW9kaWZpZXJzIH0pO1xuICAgICAgICAgICAgd2luZG93LndlYkNvbnRlbnRzLnNlbmRJbnB1dEV2ZW50KHsgdHlwZTogJ21vdXNlRG93bicsIHg6IHN0YXJ0LngsIHk6IHN0YXJ0LnksIGJ1dHRvbiwgY2xpY2tDb3VudDogMSwgbW9kaWZpZXJzIH0pO1xuICAgICAgICAgICAgZm9yIChsZXQgc3RlcCA9IDE7IHN0ZXAgPD0gc3RlcHM7IHN0ZXAgKz0gMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKHN0YXJ0LnggKyAoKGVuZC54IC0gc3RhcnQueCkgKiBzdGVwKSAvIHN0ZXBzKTtcbiAgICAgICAgICAgICAgICBjb25zdCB5ID0gTWF0aC5yb3VuZChzdGFydC55ICsgKChlbmQueSAtIHN0YXJ0LnkpICogc3RlcCkgLyBzdGVwcyk7XG4gICAgICAgICAgICAgICAgd2luZG93LndlYkNvbnRlbnRzLnNlbmRJbnB1dEV2ZW50KHsgdHlwZTogJ21vdXNlTW92ZScsIHgsIHksIGJ1dHRvbiwgbW9kaWZpZXJzIH0pO1xuICAgICAgICAgICAgICAgIGlmIChzdGVwRGVsYXlNcyA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoc3RlcERlbGF5TXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdpbmRvdy53ZWJDb250ZW50cy5zZW5kSW5wdXRFdmVudCh7IHR5cGU6ICdtb3VzZVVwJywgeDogZW5kLngsIHk6IGVuZC55LCBidXR0b24sIGNsaWNrQ291bnQ6IDEsIG1vZGlmaWVycyB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBzZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdtb3VzZV9kcmFnJyxcbiAgICAgICAgICAgICAgICBmcm9tOiBzdGFydCxcbiAgICAgICAgICAgICAgICB0bzogZW5kLFxuICAgICAgICAgICAgICAgIGJ1dHRvbixcbiAgICAgICAgICAgICAgICBzdGVwcyxcbiAgICAgICAgICAgICAgICBtb2RpZmllcnMsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHRoaXMuZ2V0V2luZG93VGl0bGUod2luZG93KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBzaW11bGF0ZSBtb3VzZSBkcmFnOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NpbXVsYXRlX2tleV9wcmVzcycsXG4gICAgICAgIHRpdGxlOiAnU2ltdWxhdGUga2V5IHByZXNzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VuZCBFbGVjdHJvbiBrZXlEb3duL2tleVVwIGlucHV0IGV2ZW50cywgb3B0aW9uYWxseSB3aXRoIGEgY2hhciBldmVudCwgdG8gdGhlIGZvY3VzZWQgb3Igc2VsZWN0ZWQgZWRpdG9yL3ByZXZpZXcvc2ltdWxhdG9yIHdpbmRvdy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgLi4ud2luZG93U2VsZWN0b3JTY2hlbWEsXG4gICAgICAgICAgICBwYW5lbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBlZGl0b3IgcGFuZWwgdG8gZm9jdXMgYmVmb3JlIHNlbmRpbmcgdGhlIGtleSBldmVudC4nKSxcbiAgICAgICAgICAgIGtleUNvZGU6IHouc3RyaW5nKCkubWluKDEpLmRlc2NyaWJlKCdFbGVjdHJvbiBrZXlDb2RlIHRvIHByZXNzLCBzdWNoIGFzIEEsIEVudGVyLCBFc2NhcGUsIEFycm93TGVmdCwgb3IgU3BhY2UuJyksXG4gICAgICAgICAgICB0ZXh0OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHRleHQgcGF5bG9hZCBmb3IgYW4gYWRkaXRpb25hbCBjaGFyIGV2ZW50IGJldHdlZW4ga2V5RG93biBhbmQga2V5VXAuJyksXG4gICAgICAgICAgICBtb2RpZmllcnM6IG1vZGlmaWVyc1NjaGVtYSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzaW11bGF0ZUtleVByZXNzKGFyZ3M6IEtleVByZXNzQXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3cgPSB0aGlzLnBpY2tXaW5kb3coYXJncyk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHdpbmRvdy5mb2N1cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5mb2N1cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFyZ3MucGFuZWwpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmdldFBhbmVsUG9pbnQod2luZG93LCBhcmdzLnBhbmVsLCAwLCAwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qga2V5Q29kZSA9IFN0cmluZyhhcmdzLmtleUNvZGUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICgha2V5Q29kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdrZXlDb2RlIGlzIHJlcXVpcmVkLicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBtb2RpZmllcnMgPSB0aGlzLm5vcm1hbGl6ZU1vZGlmaWVycyhhcmdzLm1vZGlmaWVycyk7XG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAna2V5RG93bicsIGtleUNvZGUsIG1vZGlmaWVycyB9KTtcbiAgICAgICAgICAgIGlmIChhcmdzLnRleHQpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAnY2hhcicsIGtleUNvZGU6IFN0cmluZyhhcmdzLnRleHQpLCBtb2RpZmllcnMgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aW5kb3cud2ViQ29udGVudHMuc2VuZElucHV0RXZlbnQoeyB0eXBlOiAna2V5VXAnLCBrZXlDb2RlLCBtb2RpZmllcnMgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgc2VudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB0eXBlOiAna2V5X3ByZXNzJyxcbiAgICAgICAgICAgICAgICBrZXlDb2RlLFxuICAgICAgICAgICAgICAgIG1vZGlmaWVycyxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdGhpcy5nZXRXaW5kb3dUaXRsZSh3aW5kb3cpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHNpbXVsYXRlIGtleSBwcmVzczogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldEVsZWN0cm9uKCk6IGFueSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRWxlY3Ryb24gQVBJcyBhcmUgdW5hdmFpbGFibGU6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRBbGxXaW5kb3dzKCk6IGFueVtdIHtcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSB0aGlzLmdldEVsZWN0cm9uKCk7XG4gICAgICAgIGNvbnN0IEJyb3dzZXJXaW5kb3cgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBpZiAoIUJyb3dzZXJXaW5kb3cgfHwgdHlwZW9mIEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbGVjdHJvbiBCcm93c2VyV2luZG93IEFQSSBpcyB1bmF2YWlsYWJsZS4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3aW5kb3c6IGFueSkgPT4gd2luZG93ICYmICF3aW5kb3cuaXNEZXN0cm95ZWQoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwaWNrV2luZG93KG9wdGlvbnM6IFdpbmRvd1NlbGVjdG9yQXJncyA9IHt9KTogYW55IHtcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSB0aGlzLmdldEVsZWN0cm9uKCk7XG4gICAgICAgIGNvbnN0IEJyb3dzZXJXaW5kb3cgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBjb25zdCB3aW5kb3dzID0gdGhpcy5nZXRBbGxXaW5kb3dzKCk7XG4gICAgICAgIGlmICghd2luZG93cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gRWxlY3Ryb24gd2luZG93cyBhcmUgYXZhaWxhYmxlLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMud2luZG93SWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc3QgYnlJZCA9IHdpbmRvd3MuZmluZCgodzogYW55KSA9PiB3LmlkID09PSBvcHRpb25zLndpbmRvd0lkKTtcbiAgICAgICAgICAgIGlmICghYnlJZCkgdGhyb3cgbmV3IEVycm9yKCdObyBCcm93c2VyV2luZG93IHdpdGggaWQ9JyArIG9wdGlvbnMud2luZG93SWQgKyAnIGZvdW5kLicpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5SWQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0aXRsZUNvbnRhaW5zID0gbm9ybWFsaXplVGV4dChvcHRpb25zLnRpdGxlQ29udGFpbnMpO1xuICAgICAgICBjb25zdCB3aW5kb3dLaW5kID0gbm9ybWFsaXplVGV4dChvcHRpb25zLndpbmRvd0tpbmQgfHwgJ2ZvY3VzZWQnKTtcbiAgICAgICAgY29uc3QgZm9jdXNlZFdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdyAmJiBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKTtcblxuICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gd2luZG93cy5maWx0ZXIoKHdpbmRvdzogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0aXRsZSA9IHRoaXMuZ2V0V2luZG93VGl0bGUod2luZG93KTtcbiAgICAgICAgICAgIGNvbnN0IGtpbmQgPSBpbmZlcldpbmRvd0tpbmQodGl0bGUpO1xuICAgICAgICAgICAgY29uc3Qga2luZE1hdGNoZXMgPSB3aW5kb3dLaW5kID09PSAnZm9jdXNlZCdcbiAgICAgICAgICAgICAgICB8fCB3aW5kb3dLaW5kID09PSAnJ1xuICAgICAgICAgICAgICAgIHx8IGtpbmQgPT09IHdpbmRvd0tpbmQ7XG4gICAgICAgICAgICBjb25zdCB0aXRsZU1hdGNoZXMgPSAhdGl0bGVDb250YWlucyB8fCBub3JtYWxpemVUZXh0KHRpdGxlKS5pbmNsdWRlcyh0aXRsZUNvbnRhaW5zKTtcbiAgICAgICAgICAgIHJldHVybiBraW5kTWF0Y2hlcyAmJiB0aXRsZU1hdGNoZXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IChmb2N1c2VkV2luZG93ICYmIGNhbmRpZGF0ZXMuaW5jbHVkZXMoZm9jdXNlZFdpbmRvdykgJiYgZm9jdXNlZFdpbmRvdylcbiAgICAgICAgICAgIHx8IGNhbmRpZGF0ZXMuZmluZCgod2luZG93OiBhbnkpID0+IHR5cGVvZiB3aW5kb3cuaXNWaXNpYmxlID09PSAnZnVuY3Rpb24nID8gd2luZG93LmlzVmlzaWJsZSgpIDogdHJ1ZSlcbiAgICAgICAgICAgIHx8IGNhbmRpZGF0ZXNbMF1cbiAgICAgICAgICAgIHx8IHdpbmRvd3NbMF07XG5cbiAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gQnJvd3NlcldpbmRvdyBtYXRjaGVkIHdpbmRvd0tpbmQ9JyR7d2luZG93S2luZH0nIHRpdGxlQ29udGFpbnM9JyR7dGl0bGVDb250YWluc30nLmApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBmb2N1c1RhcmdldCh3aW5kb3c6IGFueSwgcGFuZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgeDogbnVtYmVyID0gMCwgeTogbnVtYmVyID0gMCk6IFByb21pc2U8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PiB7XG4gICAgICAgIGlmICh0eXBlb2Ygd2luZG93LmZvY3VzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB3aW5kb3cuZm9jdXMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlUG9pbnQod2luZG93LCBwYW5lbCwgeCwgeSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNvbHZlUG9pbnQod2luZG93OiBhbnksIHBhbmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHg6IG51bWJlciA9IDAsIHk6IG51bWJlciA9IDApOiBQcm9taXNlPHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4ge1xuICAgICAgICBpZiAocGFuZWwpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFBhbmVsUG9pbnQod2luZG93LCBwYW5lbCwgeCwgeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgeDogTWF0aC5mbG9vcih4IHx8IDApLCB5OiBNYXRoLmZsb29yKHkgfHwgMCkgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBhbmVsUG9pbnQod2luZG93OiBhbnksIHBhbmVsTmFtZTogc3RyaW5nLCBvZmZzZXRYOiBudW1iZXIgPSAwLCBvZmZzZXRZOiBudW1iZXIgPSAwKTogUHJvbWlzZTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+IHtcbiAgICAgICAgY29uc3Qgc2NyaXB0ID0gdGhpcy5idWlsZFBhbmVsRm9jdXNTY3JpcHQocGFuZWxOYW1lLCBvZmZzZXRYLCBvZmZzZXRZKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQod2luZG93LCBzY3JpcHQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUphdmFTY3JpcHQod2luZG93OiBhbnksIHNjcmlwdDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgaWYgKCF3aW5kb3cgfHwgIXdpbmRvdy53ZWJDb250ZW50cyB8fCB0eXBlb2Ygd2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhcmdldCB3aW5kb3cgZG9lcyBub3Qgc3VwcG9ydCB3ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gd2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZFBhbmVsRm9jdXNTY3JpcHQocGFuZWxOYW1lOiBzdHJpbmcsIG9mZnNldFg6IG51bWJlciwgb2Zmc2V0WTogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICAgICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFuZWxOYW1lID0gJHtKU09OLnN0cmluZ2lmeShTdHJpbmcocGFuZWxOYW1lIHx8ICdzY2VuZScpLnRvTG93ZXJDYXNlKCkpfTtcbiAgICAgICAgICAgICAgICBjb25zdCBvZmZzZXRYID0gJHtOdW1iZXIob2Zmc2V0WCB8fCAwKX07XG4gICAgICAgICAgICAgICAgY29uc3Qgb2Zmc2V0WSA9ICR7TnVtYmVyKG9mZnNldFkgfHwgMCl9O1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzVmlzaWJsZSA9IChlbGVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZWxlbWVudCB8fCB0eXBlb2YgZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdHlsZSAmJiBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiYgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiYgcmVjdC53aWR0aCA+IDQgJiYgcmVjdC5oZWlnaHQgPiA0O1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dE9mID0gKGVsZW1lbnQpID0+IFtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUgJiYgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUgJiYgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyksXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuaWQsXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnRleHRDb250ZW50LFxuICAgICAgICAgICAgICAgIF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbGxlY3RBbGwgPSAocm9vdCwgYnVja2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcm9vdCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlcyA9IHJvb3QucXVlcnlTZWxlY3RvckFsbCA/IHJvb3QucXVlcnlTZWxlY3RvckFsbCgnKicpIDogW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnVja2V0LnB1c2gobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5zaGFkb3dSb290KSBjb2xsZWN0QWxsKG5vZGUuc2hhZG93Um9vdCwgYnVja2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsID0gW107XG4gICAgICAgICAgICAgICAgY29sbGVjdEFsbChkb2N1bWVudCwgYWxsKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBhbGwuZmluZCgoZWxlbWVudCkgPT4gaXNWaXNpYmxlKGVsZW1lbnQpICYmIHRleHRPZihlbGVtZW50KS5pbmNsdWRlcyhwYW5lbE5hbWUpKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZWN0ID0gdGFyZ2V0ID8gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIDogeyBsZWZ0OiAwLCB0b3A6IDAsIHdpZHRoOiB3aW5kb3cuaW5uZXJXaWR0aCwgaGVpZ2h0OiB3aW5kb3cuaW5uZXJIZWlnaHQgfTtcbiAgICAgICAgICAgICAgICBjb25zdCB4ID0gTWF0aC5mbG9vcihyZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiArIG9mZnNldFgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHkgPSBNYXRoLmZsb29yKHJlY3QudG9wICsgcmVjdC5oZWlnaHQgLyAyICsgb2Zmc2V0WSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9jdXNhYmxlID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludCh4LCB5KSB8fCB0YXJnZXQgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgICAgICBpZiAoZm9jdXNhYmxlICYmIHR5cGVvZiBmb2N1c2FibGUuZm9jdXMgPT09ICdmdW5jdGlvbicpIGZvY3VzYWJsZS5mb2N1cygpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHgsIHkgfTtcbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBub3JtYWxpemVNb2RpZmllcnMobW9kaWZpZXJzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkobW9kaWZpZXJzKSA/IG1vZGlmaWVycy5tYXAoaXRlbSA9PiBTdHJpbmcoaXRlbSkpIDogW107XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRXaW5kb3dUaXRsZSh3aW5kb3c6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0eXBlb2Ygd2luZG93LmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luZG93LmdldFRpdGxlKCkgOiAnJztcbiAgICB9XG59XG4iXX0=