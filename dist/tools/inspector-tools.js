"use strict";
/**
 * inspector-tools — TypeScript class-definition generator backed by
 * cocos `scene/query-node` dumps.
 *
 * Two MCP tools:
 *   - inspector_get_instance_definition  — for a node or component
 *     reference, walk the cocos dump and emit a TypeScript class
 *     declaration AI can read before changing properties. Avoids the
 *     "AI guesses property name" failure mode.
 *   - inspector_get_common_types_definition — return hardcoded
 *     definitions for cocos value types (Vec2/3/4, Color, Rect, etc.)
 *     that the instance definition references but doesn't inline.
 *
 * Reference: cocos-code-mode (RomaRogov)
 * `D:/1_dev/cocos-mcp-references/cocos-code-mode/source/utcp/tools/typescript-defenition.ts`.
 * Our impl is intentionally a basic walk — handles property name + type
 * + array + reference; defers enum/struct hoisting and per-attribute
 * decorators to later patches.
 *
 * Demonstrates the @mcpTool decorator (v2.4.0 step 5).
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectorTools = void 0;
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const instance_reference_1 = require("../lib/instance-reference");
const COMMON_TYPES_DEFINITION = `// Cocos common value types — referenced by instance definitions.
type InstanceReference<T = unknown> = { id: string; type?: string };
class Vec2 { x: number; y: number; }
class Vec3 { x: number; y: number; z: number; }
class Vec4 { x: number; y: number; z: number; w: number; }
class Color { r: number; g: number; b: number; a: number; }
class Rect { x: number; y: number; width: number; height: number; }
class Size { width: number; height: number; }
class Quat { x: number; y: number; z: number; w: number; }
class Mat3 { m00: number; m01: number; m02: number;
  m03: number; m04: number; m05: number;
  m06: number; m07: number; m08: number; }
class Mat4 { m00: number; m01: number; m02: number; m03: number;
  m04: number; m05: number; m06: number; m07: number;
  m08: number; m09: number; m10: number; m11: number;
  m12: number; m13: number; m14: number; m15: number; }
`;
// Names that show up at the top of every node dump but aren't
// user-facing properties; suppress from generated definitions.
const NODE_DUMP_INTERNAL_KEYS = new Set([
    '__type__', '__comps__', '__prefab__', '_objFlags', '_id',
    'children', 'parent',
]);
const COMPONENT_INTERNAL_KEYS = new Set([
    '__type__', '__scriptAsset', '__prefab__', '_objFlags',
    '_id', 'node', '__editorExtras__',
]);
class InspectorTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getCommonTypesDefinition() {
        return {
            success: true,
            data: { definition: COMMON_TYPES_DEFINITION },
        };
    }
    async getInstanceDefinition(args) {
        var _a, _b;
        const { reference } = args;
        if (!(reference === null || reference === void 0 ? void 0 : reference.id)) {
            return { success: false, error: 'inspector_get_instance_definition: reference.id is required' };
        }
        try {
            const dump = await Editor.Message.request('scene', 'query-node', reference.id);
            if (!dump) {
                return { success: false, error: `inspector: query-node returned no dump for ${reference.id}` };
            }
            const className = (reference.type
                || dump.__type__
                || dump.type
                || 'CocosInstance').replace(/^cc\./, '');
            const isComponent = looksLikeComponent(dump);
            const ts = renderTsClass(className, dump, isComponent);
            return {
                success: true,
                data: {
                    reference: { id: reference.id, type: (_a = dump.__type__) !== null && _a !== void 0 ? _a : reference.type },
                    definition: ts,
                },
            };
        }
        catch (err) {
            return { success: false, error: `inspector: query-node failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}` };
        }
    }
}
exports.InspectorTools = InspectorTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_common_types_definition',
        description: 'Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query.',
        inputSchema: schema_1.z.object({}),
    })
], InspectorTools.prototype, "getCommonTypesDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_instance_definition',
        description: 'Generate a TypeScript class declaration for a scene node or component, derived from the live cocos query-node dump. AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. Returns plain TS source as a string.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.describe('Target node or component. {id} = UUID, {type} optional cc class label.'),
        }),
    })
], InspectorTools.prototype, "getInstanceDefinition", null);
function looksLikeComponent(dump) {
    var _a, _b;
    const t = ((_b = (_a = dump === null || dump === void 0 ? void 0 : dump.__type__) !== null && _a !== void 0 ? _a : dump === null || dump === void 0 ? void 0 : dump.type) !== null && _b !== void 0 ? _b : '');
    if (typeof t !== 'string')
        return false;
    return t.startsWith('cc.') && t !== 'cc.Node' && t !== 'cc.Scene';
}
/**
 * Render a single class declaration. For nodes, also enumerate
 * components from `__comps__` as a comment so AI knows which
 * sub-instances exist (without inlining their full TS — those
 * require a separate get_instance_definition call by component
 * UUID).
 */
function renderTsClass(className, dump, isComponent) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const lines = [];
    lines.push(`class ${sanitizeTsName(className)} {`);
    const internalKeys = isComponent ? COMPONENT_INTERNAL_KEYS : NODE_DUMP_INTERNAL_KEYS;
    for (const propName of Object.keys(dump)) {
        if (internalKeys.has(propName))
            continue;
        const propEntry = dump[propName];
        if (propEntry === undefined || propEntry === null)
            continue;
        // Cocos dump entries are typically `{type, value, visible?, readonly?, ...}`.
        // Skip explicitly-hidden inspector fields; they're not user-facing.
        if (typeof propEntry === 'object' && propEntry.visible === false)
            continue;
        const tsType = resolveTsType(propEntry);
        const readonly = (propEntry === null || propEntry === void 0 ? void 0 : propEntry.readonly) ? 'readonly ' : '';
        const tooltipSrc = propEntry === null || propEntry === void 0 ? void 0 : propEntry.tooltip;
        if (tooltipSrc && typeof tooltipSrc === 'string') {
            lines.push(`    /** ${tooltipSrc.replace(/\*\//g, '*\\/')} */`);
        }
        lines.push(`    ${readonly}${propName}: ${tsType};`);
    }
    if (!isComponent && Array.isArray(dump.__comps__) && dump.__comps__.length > 0) {
        lines.push('');
        lines.push('    // Components on this node (read each via get_instance_definition with the component uuid):');
        for (const comp of dump.__comps__) {
            const cType = (_b = (_a = comp === null || comp === void 0 ? void 0 : comp.__type__) !== null && _a !== void 0 ? _a : comp === null || comp === void 0 ? void 0 : comp.type) !== null && _b !== void 0 ? _b : 'unknown';
            const cUuid = (_h = (_g = (_e = (_d = (_c = comp === null || comp === void 0 ? void 0 : comp.value) === null || _c === void 0 ? void 0 : _c.uuid) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : (_f = comp === null || comp === void 0 ? void 0 : comp.uuid) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : comp === null || comp === void 0 ? void 0 : comp.uuid) !== null && _h !== void 0 ? _h : '?';
            lines.push(`    // - ${cType}  uuid=${cUuid}`);
        }
    }
    lines.push('}');
    return lines.join('\n');
}
function resolveTsType(entry) {
    var _a, _b;
    if (entry === undefined || entry === null)
        return 'unknown';
    // Plain primitives passed through directly (rare in dump shape).
    const tt = typeof entry;
    if (tt === 'string')
        return 'string';
    if (tt === 'number')
        return 'number';
    if (tt === 'boolean')
        return 'boolean';
    const rawType = (_b = (_a = entry.type) !== null && _a !== void 0 ? _a : entry.__type__) !== null && _b !== void 0 ? _b : '';
    const isArray = !!entry.isArray;
    let ts;
    switch (rawType) {
        case 'String':
            ts = 'string';
            break;
        case 'Boolean':
            ts = 'boolean';
            break;
        case 'Integer':
        case 'Float':
        case 'Number':
            ts = 'number';
            break;
        case 'Enum':
        case 'BitMask':
            ts = 'number';
            break;
        case 'cc.Vec2':
            ts = 'Vec2';
            break;
        case 'cc.Vec3':
            ts = 'Vec3';
            break;
        case 'cc.Vec4':
            ts = 'Vec4';
            break;
        case 'cc.Color':
            ts = 'Color';
            break;
        case 'cc.Rect':
            ts = 'Rect';
            break;
        case 'cc.Size':
            ts = 'Size';
            break;
        case 'cc.Quat':
            ts = 'Quat';
            break;
        case 'cc.Mat3':
            ts = 'Mat3';
            break;
        case 'cc.Mat4':
            ts = 'Mat4';
            break;
        case '':
            ts = 'unknown';
            break;
        default: {
            const strippedType = rawType.replace(/^cc\./, '');
            const extendsList = Array.isArray(entry.extends) ? entry.extends : [];
            const isReference = extendsList.includes('cc.Object')
                || rawType === 'Node'
                || rawType === 'Component'
                || rawType === 'cc.Node'
                || rawType === 'cc.Component'
                || rawType.startsWith('cc.');
            ts = isReference ? `InstanceReference<${strippedType}>` : strippedType;
        }
    }
    return isArray ? `Array<${ts}>` : ts;
}
function sanitizeTsName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7Ozs7Ozs7QUFHSCwwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLGtFQUF1RjtBQUV2RixNQUFNLHVCQUF1QixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7O0NBZ0IvQixDQUFDO0FBRUYsOERBQThEO0FBQzlELCtEQUErRDtBQUMvRCxNQUFNLHVCQUF1QixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ3BDLFVBQVUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxLQUFLO0lBQ3pELFVBQVUsRUFBRSxRQUFRO0NBQ3ZCLENBQUMsQ0FBQztBQUVILE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEMsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsV0FBVztJQUN0RCxLQUFLLEVBQUUsTUFBTSxFQUFFLGtCQUFrQjtDQUNwQyxDQUFDLENBQUM7QUFFSCxNQUFhLGNBQWM7SUFHdkI7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQU9uRyxBQUFOLEtBQUssQ0FBQyx3QkFBd0I7UUFDMUIsT0FBTztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsSUFBSSxFQUFFLEVBQUUsVUFBVSxFQUFFLHVCQUF1QixFQUFF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Z0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDL0MsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogaW5zcGVjdG9yLXRvb2xzIOKAlCBUeXBlU2NyaXB0IGNsYXNzLWRlZmluaXRpb24gZ2VuZXJhdG9yIGJhY2tlZCBieVxuICogY29jb3MgYHNjZW5lL3F1ZXJ5LW5vZGVgIGR1bXBzLlxuICpcbiAqIFR3byBNQ1AgdG9vbHM6XG4gKiAgIC0gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uICDigJQgZm9yIGEgbm9kZSBvciBjb21wb25lbnRcbiAqICAgICByZWZlcmVuY2UsIHdhbGsgdGhlIGNvY29zIGR1bXAgYW5kIGVtaXQgYSBUeXBlU2NyaXB0IGNsYXNzXG4gKiAgICAgZGVjbGFyYXRpb24gQUkgY2FuIHJlYWQgYmVmb3JlIGNoYW5naW5nIHByb3BlcnRpZXMuIEF2b2lkcyB0aGVcbiAqICAgICBcIkFJIGd1ZXNzZXMgcHJvcGVydHkgbmFtZVwiIGZhaWx1cmUgbW9kZS5cbiAqICAgLSBpbnNwZWN0b3JfZ2V0X2NvbW1vbl90eXBlc19kZWZpbml0aW9uIOKAlCByZXR1cm4gaGFyZGNvZGVkXG4gKiAgICAgZGVmaW5pdGlvbnMgZm9yIGNvY29zIHZhbHVlIHR5cGVzIChWZWMyLzMvNCwgQ29sb3IsIFJlY3QsIGV0Yy4pXG4gKiAgICAgdGhhdCB0aGUgaW5zdGFuY2UgZGVmaW5pdGlvbiByZWZlcmVuY2VzIGJ1dCBkb2Vzbid0IGlubGluZS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLWNvZGUtbW9kZSAoUm9tYVJvZ292KVxuICogYEQ6LzFfZGV2L2NvY29zLW1jcC1yZWZlcmVuY2VzL2NvY29zLWNvZGUtbW9kZS9zb3VyY2UvdXRjcC90b29scy90eXBlc2NyaXB0LWRlZmVuaXRpb24udHNgLlxuICogT3VyIGltcGwgaXMgaW50ZW50aW9uYWxseSBhIGJhc2ljIHdhbGsg4oCUIGhhbmRsZXMgcHJvcGVydHkgbmFtZSArIHR5cGVcbiAqICsgYXJyYXkgKyByZWZlcmVuY2U7IGRlZmVycyBlbnVtL3N0cnVjdCBob2lzdGluZyBhbmQgcGVyLWF0dHJpYnV0ZVxuICogZGVjb3JhdG9ycyB0byBsYXRlciBwYXRjaGVzLlxuICpcbiAqIERlbW9uc3RyYXRlcyB0aGUgQG1jcFRvb2wgZGVjb3JhdG9yICh2Mi40LjAgc3RlcCA1KS5cbiAqL1xuXG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsIEluc3RhbmNlUmVmZXJlbmNlIH0gZnJvbSAnLi4vbGliL2luc3RhbmNlLXJlZmVyZW5jZSc7XG5cbmNvbnN0IENPTU1PTl9UWVBFU19ERUZJTklUSU9OID0gYC8vIENvY29zIGNvbW1vbiB2YWx1ZSB0eXBlcyDigJQgcmVmZXJlbmNlZCBieSBpbnN0YW5jZSBkZWZpbml0aW9ucy5cbnR5cGUgSW5zdGFuY2VSZWZlcmVuY2U8VCA9IHVua25vd24+ID0geyBpZDogc3RyaW5nOyB0eXBlPzogc3RyaW5nIH07XG5jbGFzcyBWZWMyIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IH1cbmNsYXNzIFZlYzMgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB9XG5jbGFzcyBWZWM0IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgdzogbnVtYmVyOyB9XG5jbGFzcyBDb2xvciB7IHI6IG51bWJlcjsgZzogbnVtYmVyOyBiOiBudW1iZXI7IGE6IG51bWJlcjsgfVxuY2xhc3MgUmVjdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgU2l6ZSB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9XG5jbGFzcyBRdWF0IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgdzogbnVtYmVyOyB9XG5jbGFzcyBNYXQzIHsgbTAwOiBudW1iZXI7IG0wMTogbnVtYmVyOyBtMDI6IG51bWJlcjtcbiAgbTAzOiBudW1iZXI7IG0wNDogbnVtYmVyOyBtMDU6IG51bWJlcjtcbiAgbTA2OiBudW1iZXI7IG0wNzogbnVtYmVyOyBtMDg6IG51bWJlcjsgfVxuY2xhc3MgTWF0NCB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7IG0wMzogbnVtYmVyO1xuICBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7IG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjtcbiAgbTA4OiBudW1iZXI7IG0wOTogbnVtYmVyOyBtMTA6IG51bWJlcjsgbTExOiBudW1iZXI7XG4gIG0xMjogbnVtYmVyOyBtMTM6IG51bWJlcjsgbTE0OiBudW1iZXI7IG0xNTogbnVtYmVyOyB9XG5gO1xuXG4vLyBOYW1lcyB0aGF0IHNob3cgdXAgYXQgdGhlIHRvcCBvZiBldmVyeSBub2RlIGR1bXAgYnV0IGFyZW4ndFxuLy8gdXNlci1mYWNpbmcgcHJvcGVydGllczsgc3VwcHJlc3MgZnJvbSBnZW5lcmF0ZWQgZGVmaW5pdGlvbnMuXG5jb25zdCBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX2NvbXBzX18nLCAnX19wcmVmYWJfXycsICdfb2JqRmxhZ3MnLCAnX2lkJyxcbiAgICAnY2hpbGRyZW4nLCAncGFyZW50Jyxcbl0pO1xuXG5jb25zdCBDT01QT05FTlRfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX3NjcmlwdEFzc2V0JywgJ19fcHJlZmFiX18nLCAnX29iakZsYWdzJyxcbiAgICAnX2lkJywgJ25vZGUnLCAnX19lZGl0b3JFeHRyYXNfXycsXG5dKTtcblxuZXhwb3J0IGNsYXNzIEluc3BlY3RvclRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIGhhcmRjb2RlZCBUeXBlU2NyaXB0IGRlY2xhcmF0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgU2l6ZSwgUXVhdCwgTWF0My80KSBhbmQgdGhlIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLiBBSSBjYW4gcHJlcGVuZCB0aGlzIHRvIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiBvdXRwdXQgYmVmb3JlIGdlbmVyYXRpbmcgdHlwZS1zYWZlIGNvZGUuIE5vIHNjZW5lIHF1ZXJ5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRDb21tb25UeXBlc0RlZmluaXRpb24oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2luc3RhbmNlX2RlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBmb3IgYSBzY2VuZSBub2RlIG9yIGNvbXBvbmVudCwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHF1ZXJ5LW5vZGUgZHVtcC4gQUkgc2hvdWxkIGNhbGwgdGhpcyBCRUZPUkUgd3JpdGluZyBwcm9wZXJ0aWVzIHNvIGl0IHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIHdpdGggZ2V0X2NvbW1vbl90eXBlc19kZWZpbml0aW9uIGZvciBWZWMyL0NvbG9yL2V0YyByZWZlcmVuY2VzLiBSZXR1cm5zIHBsYWluIFRTIHNvdXJjZSBhcyBhIHN0cmluZy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgb3IgY29tcG9uZW50LiB7aWR9ID0gVVVJRCwge3R5cGV9IG9wdGlvbmFsIGNjIGNsYXNzIGxhYmVsLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEluc3RhbmNlRGVmaW5pdGlvbihhcmdzOiB7IHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgcmVmZXJlbmNlIH0gPSBhcmdzO1xuICAgICAgICBpZiAoIXJlZmVyZW5jZT8uaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgcmVmZXJlbmNlLmlkKTtcbiAgICAgICAgICAgIGlmICghZHVtcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGluc3BlY3RvcjogcXVlcnktbm9kZSByZXR1cm5lZCBubyBkdW1wIGZvciAke3JlZmVyZW5jZS5pZH1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGFzc05hbWUgPSAocmVmZXJlbmNlLnR5cGVcbiAgICAgICAgICAgICAgICB8fCBkdW1wLl9fdHlwZV9fXG4gICAgICAgICAgICAgICAgfHwgZHVtcC50eXBlXG4gICAgICAgICAgICAgICAgfHwgJ0NvY29zSW5zdGFuY2UnKS5yZXBsYWNlKC9eY2NcXC4vLCAnJyk7XG4gICAgICAgICAgICBjb25zdCBpc0NvbXBvbmVudCA9IGxvb2tzTGlrZUNvbXBvbmVudChkdW1wKTtcbiAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWUsIGR1bXAsIGlzQ29tcG9uZW50KTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiBkdW1wLl9fdHlwZV9fID8/IHJlZmVyZW5jZS50eXBlIH0sXG4gICAgICAgICAgICAgICAgICAgIGRlZmluaXRpb246IHRzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgaW5zcGVjdG9yOiBxdWVyeS1ub2RlIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBsb29rc0xpa2VDb21wb25lbnQoZHVtcDogYW55KTogYm9vbGVhbiB7XG4gICAgY29uc3QgdCA9IChkdW1wPy5fX3R5cGVfXyA/PyBkdW1wPy50eXBlID8/ICcnKSBhcyBzdHJpbmc7XG4gICAgaWYgKHR5cGVvZiB0ICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0LnN0YXJ0c1dpdGgoJ2NjLicpICYmIHQgIT09ICdjYy5Ob2RlJyAmJiB0ICE9PSAnY2MuU2NlbmUnO1xufVxuXG4vKipcbiAqIFJlbmRlciBhIHNpbmdsZSBjbGFzcyBkZWNsYXJhdGlvbi4gRm9yIG5vZGVzLCBhbHNvIGVudW1lcmF0ZVxuICogY29tcG9uZW50cyBmcm9tIGBfX2NvbXBzX19gIGFzIGEgY29tbWVudCBzbyBBSSBrbm93cyB3aGljaFxuICogc3ViLWluc3RhbmNlcyBleGlzdCAod2l0aG91dCBpbmxpbmluZyB0aGVpciBmdWxsIFRTIOKAlCB0aG9zZVxuICogcmVxdWlyZSBhIHNlcGFyYXRlIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIGNhbGwgYnkgY29tcG9uZW50XG4gKiBVVUlEKS5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZHVtcDogYW55LCBpc0NvbXBvbmVudDogYm9vbGVhbik6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgbGluZXMucHVzaChgY2xhc3MgJHtzYW5pdGl6ZVRzTmFtZShjbGFzc05hbWUpfSB7YCk7XG5cbiAgICBjb25zdCBpbnRlcm5hbEtleXMgPSBpc0NvbXBvbmVudCA/IENPTVBPTkVOVF9JTlRFUk5BTF9LRVlTIDogTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVM7XG4gICAgZm9yIChjb25zdCBwcm9wTmFtZSBvZiBPYmplY3Qua2V5cyhkdW1wKSkge1xuICAgICAgICBpZiAoaW50ZXJuYWxLZXlzLmhhcyhwcm9wTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBwcm9wRW50cnkgPSBkdW1wW3Byb3BOYW1lXTtcbiAgICAgICAgaWYgKHByb3BFbnRyeSA9PT0gdW5kZWZpbmVkIHx8IHByb3BFbnRyeSA9PT0gbnVsbCkgY29udGludWU7XG4gICAgICAgIC8vIENvY29zIGR1bXAgZW50cmllcyBhcmUgdHlwaWNhbGx5IGB7dHlwZSwgdmFsdWUsIHZpc2libGU/LCByZWFkb25seT8sIC4uLn1gLlxuICAgICAgICAvLyBTa2lwIGV4cGxpY2l0bHktaGlkZGVuIGluc3BlY3RvciBmaWVsZHM7IHRoZXkncmUgbm90IHVzZXItZmFjaW5nLlxuICAgICAgICBpZiAodHlwZW9mIHByb3BFbnRyeSA9PT0gJ29iamVjdCcgJiYgcHJvcEVudHJ5LnZpc2libGUgPT09IGZhbHNlKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0c1R5cGUgPSByZXNvbHZlVHNUeXBlKHByb3BFbnRyeSk7XG4gICAgICAgIGNvbnN0IHJlYWRvbmx5ID0gcHJvcEVudHJ5Py5yZWFkb25seSA/ICdyZWFkb25seSAnIDogJyc7XG4gICAgICAgIGNvbnN0IHRvb2x0aXBTcmM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHByb3BFbnRyeT8udG9vbHRpcDtcbiAgICAgICAgaWYgKHRvb2x0aXBTcmMgJiYgdHlwZW9mIHRvb2x0aXBTcmMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLyoqICR7dG9vbHRpcFNyYy5yZXBsYWNlKC9cXCpcXC8vZywgJypcXFxcLycpfSAqL2ApO1xuICAgICAgICB9XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAke3JlYWRvbmx5fSR7cHJvcE5hbWV9OiAke3RzVHlwZX07YCk7XG4gICAgfVxuXG4gICAgaWYgKCFpc0NvbXBvbmVudCAmJiBBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKSAmJiBkdW1wLl9fY29tcHNfXy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcgICAgLy8gQ29tcG9uZW50cyBvbiB0aGlzIG5vZGUgKHJlYWQgZWFjaCB2aWEgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gd2l0aCB0aGUgY29tcG9uZW50IHV1aWQpOicpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZHVtcC5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIGNvbnN0IGNUeXBlID0gY29tcD8uX190eXBlX18gPz8gY29tcD8udHlwZSA/PyAndW5rbm93bic7XG4gICAgICAgICAgICBjb25zdCBjVXVpZCA9IGNvbXA/LnZhbHVlPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkID8/ICc/JztcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvLyAtICR7Y1R5cGV9ICB1dWlkPSR7Y1V1aWR9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNUeXBlKGVudHJ5OiBhbnkpOiBzdHJpbmcge1xuICAgIGlmIChlbnRyeSA9PT0gdW5kZWZpbmVkIHx8IGVudHJ5ID09PSBudWxsKSByZXR1cm4gJ3Vua25vd24nO1xuICAgIC8vIFBsYWluIHByaW1pdGl2ZXMgcGFzc2VkIHRocm91Z2ggZGlyZWN0bHkgKHJhcmUgaW4gZHVtcCBzaGFwZSkuXG4gICAgY29uc3QgdHQgPSB0eXBlb2YgZW50cnk7XG4gICAgaWYgKHR0ID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0dCA9PT0gJ251bWJlcicpIHJldHVybiAnbnVtYmVyJztcbiAgICBpZiAodHQgPT09ICdib29sZWFuJykgcmV0dXJuICdib29sZWFuJztcblxuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnkuaXNBcnJheTtcblxuICAgIGxldCB0czogc3RyaW5nO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdTdHJpbmcnOiB0cyA9ICdzdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IHRzID0gJ2Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzInOiB0cyA9ICdWZWMyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzMnOiB0cyA9ICdWZWMzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzQnOiB0cyA9ICdWZWM0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLkNvbG9yJzogdHMgPSAnQ29sb3InOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUmVjdCc6IHRzID0gJ1JlY3QnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuU2l6ZSc6IHRzID0gJ1NpemUnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUXVhdCc6IHRzID0gJ1F1YXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0Myc6IHRzID0gJ01hdDMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0NCc6IHRzID0gJ01hdDQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJzogdHMgPSAndW5rbm93bic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZFR5cGUgPSByYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGV4dGVuZHNMaXN0OiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoZW50cnkuZXh0ZW5kcykgPyBlbnRyeS5leHRlbmRzIDogW107XG4gICAgICAgICAgICBjb25zdCBpc1JlZmVyZW5jZSA9IGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5PYmplY3QnKVxuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdOb2RlJ1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdDb21wb25lbnQnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLk5vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLkNvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xuICAgICAgICAgICAgdHMgPSBpc1JlZmVyZW5jZSA/IGBJbnN0YW5jZVJlZmVyZW5jZTwke3N0cmlwcGVkVHlwZX0+YCA6IHN0cmlwcGVkVHlwZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gaXNBcnJheSA/IGBBcnJheTwke3RzfT5gIDogdHM7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplVHNOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCAnXycpO1xufVxuIl19