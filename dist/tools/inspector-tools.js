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
// v2.4.1 review fix (codex): expanded from the v2.4.0 minimal list to
// cover prefab-instance/serialization metadata and editor-only fields
// that AI shouldn't try to mutate.
const NODE_DUMP_INTERNAL_KEYS = new Set([
    '__type__', '__comps__', '__prefab__', '__editorExtras__',
    '_objFlags', '_id', 'uuid',
    'children', 'parent',
    '_prefabInstance', '_prefab', 'mountedRoot', 'mountedChildren',
    'removedComponents', '_components',
]);
const COMPONENT_INTERNAL_KEYS = new Set([
    '__type__', '__scriptAsset', '__prefab__', '__editorExtras__',
    '_objFlags', '_id', 'uuid',
    'node', '__cid__', '_componentName',
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
                return { success: false, error: `inspector: query-node returned no dump for ${reference.id}. If this is a component or asset UUID, v2.4.1 does not support it; pass the host node UUID instead.` };
            }
            const className = (reference.type
                || dump.__type__
                || dump.type
                || 'CocosInstance').replace(/^cc\./, '');
            // v2.4.1: query-node returns a node dump regardless of what
            // reference.type claims; trust the dump shape rather than
            // the caller-supplied type tag.
            const ts = renderTsClass(className, dump, /* isComponent */ false);
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
        description: 'Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. v2.4.1 note: only node-shaped references are inspected here — component/asset definition support is deferred until a verified Cocos query-component channel is wired.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.describe('Target node. {id} = node UUID, {type} optional cc class label. Component or asset references will return an error in v2.4.1.'),
        }),
    })
], InspectorTools.prototype, "getInstanceDefinition", null);
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
        const enumHint = enumCommentHint(propEntry);
        const tooltipSrc = propEntry === null || propEntry === void 0 ? void 0 : propEntry.tooltip;
        if (tooltipSrc && typeof tooltipSrc === 'string') {
            lines.push(`    /** ${sanitizeForComment(tooltipSrc)} */`);
        }
        if (enumHint) {
            lines.push(`    /** ${enumHint} */`);
        }
        const safePropName = isSafeTsIdentifier(propName) ? propName : JSON.stringify(propName);
        lines.push(`    ${readonly}${safePropName}: ${tsType};`);
    }
    if (!isComponent && Array.isArray(dump.__comps__) && dump.__comps__.length > 0) {
        lines.push('');
        lines.push('    // Components on this node (inspect each separately via get_instance_definition with the host node UUID first; component-specific dump access is v2.5+):');
        for (const comp of dump.__comps__) {
            const cType = sanitizeForComment(String((_b = (_a = comp === null || comp === void 0 ? void 0 : comp.__type__) !== null && _a !== void 0 ? _a : comp === null || comp === void 0 ? void 0 : comp.type) !== null && _b !== void 0 ? _b : 'unknown'));
            const cUuid = sanitizeForComment(String((_h = (_g = (_e = (_d = (_c = comp === null || comp === void 0 ? void 0 : comp.value) === null || _c === void 0 ? void 0 : _c.uuid) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : (_f = comp === null || comp === void 0 ? void 0 : comp.uuid) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : comp === null || comp === void 0 ? void 0 : comp.uuid) !== null && _h !== void 0 ? _h : '?'));
            lines.push(`    // - ${cType}  uuid=${cUuid}`);
        }
    }
    lines.push('}');
    return lines.join('\n');
}
// v2.4.1 review fix (claude): tooltips and component metadata can
// contain `*/` (closes the doc comment), `\n` (breaks a `//` comment
// into stray code), or `\r`. Single-line-comment context is the
// dangerous one. Strip both.
function sanitizeForComment(text) {
    return text
        .replace(/\*\//g, '*\\/')
        .replace(/\r?\n/g, ' ')
        .replace(/\r/g, ' ');
}
// v2.4.1 review fix (claude): unsanitized custom-script class names
// (e.g. `My.Foo`, `My-Foo`) emitted directly into the TS output produce
// invalid TS. JSON-stringify any property name that isn't a plain ident.
function isSafeTsIdentifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
// v2.4.1 review fix (gemini): Enum/BitMask were emitted as bare
// `number`. Surface the enum class via comment so AI can look it up
// rather than guess.
function enumCommentHint(entry) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!entry || typeof entry !== 'object')
        return null;
    const t = (_a = entry.type) !== null && _a !== void 0 ? _a : '';
    if (t !== 'Enum' && t !== 'BitMask')
        return null;
    const enumName = (_g = (_c = (_b = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _b === void 0 ? void 0 : _b.enumName) !== null && _c !== void 0 ? _c : (_f = (_e = (_d = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _d === void 0 ? void 0 : _d.enumList) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : entry === null || entry === void 0 ? void 0 : entry.enumName;
    const list = Array.isArray(entry.enumList) ? entry.enumList
        : Array.isArray(entry.bitmaskList) ? entry.bitmaskList
            : null;
    const sample = list && list.length > 0
        ? list.slice(0, 8).map((it) => {
            var _a, _b;
            const n = (_a = it === null || it === void 0 ? void 0 : it.name) !== null && _a !== void 0 ? _a : '?';
            const v = (_b = it === null || it === void 0 ? void 0 : it.value) !== null && _b !== void 0 ? _b : '?';
            return `${n}=${v}`;
        }).join(', ')
        : null;
    if (enumName) {
        return sanitizeForComment(`${t}: ${enumName}${sample ? ` — ${sample}` : ''}`);
    }
    if (sample) {
        return sanitizeForComment(`${t} values: ${sample}`);
    }
    return null;
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
            // v2.4.1 review fix (claude): sanitize custom class names
            // before pasting them into the TS output. `My.Foo` etc.
            // would be invalid TS otherwise.
            const strippedType = sanitizeTsName(rawType.replace(/^cc\./, '')) || 'unknown';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7Ozs7Ozs7QUFHSCwwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLGtFQUF1RjtBQUV2RixNQUFNLHVCQUF1QixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7O0NBZ0IvQixDQUFDO0FBRUYsOERBQThEO0FBQzlELCtEQUErRDtBQUMvRCxzRUFBc0U7QUFDdEUsc0VBQXNFO0FBQ3RFLG1DQUFtQztBQUNuQyxNQUFNLHVCQUF1QixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ3BDLFVBQVUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLGtCQUFrQjtJQUN6RCxXQUFXLEVBQUUsS0FBSyxFQUFFLE1BQU07SUFDMUIsVUFBVSxFQUFFLFFBQVE7SUFDcEIsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxpQkFBaUI7SUFDOUQsbUJBQW1CLEVBQUUsYUFBYTtDQUNyQyxDQUFDLENBQUM7QUFFSCxNQUFNLHVCQUF1QixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ3BDLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLGtCQUFrQjtJQUM3RCxXQUFXLEVBQUUsS0FBSyxFQUFFLE1BQU07SUFDMUIsTUFBTSxFQUFFLFNBQVMsRUFBRSxnQkFBZ0I7Q0FDdEMsQ0FBQyxDQUFDO0FBRUgsTUFBYSxjQUFjO0lBR3ZCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElB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QU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDekMsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLElBQVk7SUFDaEMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQy9DLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGluc3BlY3Rvci10b29scyDigJQgVHlwZVNjcmlwdCBjbGFzcy1kZWZpbml0aW9uIGdlbmVyYXRvciBiYWNrZWQgYnlcbiAqIGNvY29zIGBzY2VuZS9xdWVyeS1ub2RlYCBkdW1wcy5cbiAqXG4gKiBUd28gTUNQIHRvb2xzOlxuICogICAtIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiAg4oCUIGZvciBhIG5vZGUgb3IgY29tcG9uZW50XG4gKiAgICAgcmVmZXJlbmNlLCB3YWxrIHRoZSBjb2NvcyBkdW1wIGFuZCBlbWl0IGEgVHlwZVNjcmlwdCBjbGFzc1xuICogICAgIGRlY2xhcmF0aW9uIEFJIGNhbiByZWFkIGJlZm9yZSBjaGFuZ2luZyBwcm9wZXJ0aWVzLiBBdm9pZHMgdGhlXG4gKiAgICAgXCJBSSBndWVzc2VzIHByb3BlcnR5IG5hbWVcIiBmYWlsdXJlIG1vZGUuXG4gKiAgIC0gaW5zcGVjdG9yX2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiDigJQgcmV0dXJuIGhhcmRjb2RlZFxuICogICAgIGRlZmluaXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBldGMuKVxuICogICAgIHRoYXQgdGhlIGluc3RhbmNlIGRlZmluaXRpb24gcmVmZXJlbmNlcyBidXQgZG9lc24ndCBpbmxpbmUuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdilcbiAqIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGUvc291cmNlL3V0Y3AvdG9vbHMvdHlwZXNjcmlwdC1kZWZlbml0aW9uLnRzYC5cbiAqIE91ciBpbXBsIGlzIGludGVudGlvbmFsbHkgYSBiYXNpYyB3YWxrIOKAlCBoYW5kbGVzIHByb3BlcnR5IG5hbWUgKyB0eXBlXG4gKiArIGFycmF5ICsgcmVmZXJlbmNlOyBkZWZlcnMgZW51bS9zdHJ1Y3QgaG9pc3RpbmcgYW5kIHBlci1hdHRyaWJ1dGVcbiAqIGRlY29yYXRvcnMgdG8gbGF0ZXIgcGF0Y2hlcy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIEBtY3BUb29sIGRlY29yYXRvciAodjIuNC4wIHN0ZXAgNSkuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuXG5jb25zdCBDT01NT05fVFlQRVNfREVGSU5JVElPTiA9IGAvLyBDb2NvcyBjb21tb24gdmFsdWUgdHlwZXMg4oCUIHJlZmVyZW5jZWQgYnkgaW5zdGFuY2UgZGVmaW5pdGlvbnMuXG50eXBlIEluc3RhbmNlUmVmZXJlbmNlPFQgPSB1bmtub3duPiA9IHsgaWQ6IHN0cmluZzsgdHlwZT86IHN0cmluZyB9O1xuY2xhc3MgVmVjMiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB9XG5jbGFzcyBWZWMzIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfVxuY2xhc3MgVmVjNCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgQ29sb3IgeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXI7IH1cbmNsYXNzIFJlY3QgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFNpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgUXVhdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgTWF0MyB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7XG4gIG0wMzogbnVtYmVyOyBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7XG4gIG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjsgbTA4OiBudW1iZXI7IH1cbmNsYXNzIE1hdDQgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyOyBtMDM6IG51bWJlcjtcbiAgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyOyBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7XG4gIG0wODogbnVtYmVyOyBtMDk6IG51bWJlcjsgbTEwOiBudW1iZXI7IG0xMTogbnVtYmVyO1xuICBtMTI6IG51bWJlcjsgbTEzOiBudW1iZXI7IG0xNDogbnVtYmVyOyBtMTU6IG51bWJlcjsgfVxuYDtcblxuLy8gTmFtZXMgdGhhdCBzaG93IHVwIGF0IHRoZSB0b3Agb2YgZXZlcnkgbm9kZSBkdW1wIGJ1dCBhcmVuJ3Rcbi8vIHVzZXItZmFjaW5nIHByb3BlcnRpZXM7IHN1cHByZXNzIGZyb20gZ2VuZXJhdGVkIGRlZmluaXRpb25zLlxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNvZGV4KTogZXhwYW5kZWQgZnJvbSB0aGUgdjIuNC4wIG1pbmltYWwgbGlzdCB0b1xuLy8gY292ZXIgcHJlZmFiLWluc3RhbmNlL3NlcmlhbGl6YXRpb24gbWV0YWRhdGEgYW5kIGVkaXRvci1vbmx5IGZpZWxkc1xuLy8gdGhhdCBBSSBzaG91bGRuJ3QgdHJ5IHRvIG11dGF0ZS5cbmNvbnN0IE5PREVfRFVNUF9JTlRFUk5BTF9LRVlTID0gbmV3IFNldChbXG4gICAgJ19fdHlwZV9fJywgJ19fY29tcHNfXycsICdfX3ByZWZhYl9fJywgJ19fZWRpdG9yRXh0cmFzX18nLFxuICAgICdfb2JqRmxhZ3MnLCAnX2lkJywgJ3V1aWQnLFxuICAgICdjaGlsZHJlbicsICdwYXJlbnQnLFxuICAgICdfcHJlZmFiSW5zdGFuY2UnLCAnX3ByZWZhYicsICdtb3VudGVkUm9vdCcsICdtb3VudGVkQ2hpbGRyZW4nLFxuICAgICdyZW1vdmVkQ29tcG9uZW50cycsICdfY29tcG9uZW50cycsXG5dKTtcblxuY29uc3QgQ09NUE9ORU5UX0lOVEVSTkFMX0tFWVMgPSBuZXcgU2V0KFtcbiAgICAnX190eXBlX18nLCAnX19zY3JpcHRBc3NldCcsICdfX3ByZWZhYl9fJywgJ19fZWRpdG9yRXh0cmFzX18nLFxuICAgICdfb2JqRmxhZ3MnLCAnX2lkJywgJ3V1aWQnLFxuICAgICdub2RlJywgJ19fY2lkX18nLCAnX2NvbXBvbmVudE5hbWUnLFxuXSk7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiBoYXJkY29kZWQgVHlwZVNjcmlwdCBkZWNsYXJhdGlvbnMgZm9yIGNvY29zIHZhbHVlIHR5cGVzIChWZWMyLzMvNCwgQ29sb3IsIFJlY3QsIFNpemUsIFF1YXQsIE1hdDMvNCkgYW5kIHRoZSBJbnN0YW5jZVJlZmVyZW5jZSBzaGFwZS4gQUkgY2FuIHByZXBlbmQgdGhpcyB0byBpbnNwZWN0b3JfZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gb3V0cHV0IGJlZm9yZSBnZW5lcmF0aW5nIHR5cGUtc2FmZSBjb2RlLiBObyBzY2VuZSBxdWVyeS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Q29tbW9uVHlwZXNEZWZpbml0aW9uKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YTogeyBkZWZpbml0aW9uOiBDT01NT05fVFlQRVNfREVGSU5JVElPTiB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9pbnN0YW5jZV9kZWZpbml0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGEgc2NlbmUgbm9kZSwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHNjZW5lL3F1ZXJ5LW5vZGUgZHVtcC4gVGhlIGdlbmVyYXRlZCBjbGFzcyBpbmNsdWRlcyBhIGNvbW1lbnQgbGlzdGluZyB0aGUgY29tcG9uZW50cyBhdHRhY2hlZCB0byB0aGUgbm9kZSAod2l0aCBVVUlEcykuIEFJIHNob3VsZCBjYWxsIHRoaXMgQkVGT1JFIHdyaXRpbmcgcHJvcGVydGllcyBzbyBpdCBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciB3aXRoIGdldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiBmb3IgVmVjMi9Db2xvci9ldGMgcmVmZXJlbmNlcy4gdjIuNC4xIG5vdGU6IG9ubHkgbm9kZS1zaGFwZWQgcmVmZXJlbmNlcyBhcmUgaW5zcGVjdGVkIGhlcmUg4oCUIGNvbXBvbmVudC9hc3NldCBkZWZpbml0aW9uIHN1cHBvcnQgaXMgZGVmZXJyZWQgdW50aWwgYSB2ZXJpZmllZCBDb2NvcyBxdWVyeS1jb21wb25lbnQgY2hhbm5lbCBpcyB3aXJlZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUuIHtpZH0gPSBub2RlIFVVSUQsIHt0eXBlfSBvcHRpb25hbCBjYyBjbGFzcyBsYWJlbC4gQ29tcG9uZW50IG9yIGFzc2V0IHJlZmVyZW5jZXMgd2lsbCByZXR1cm4gYW4gZXJyb3IgaW4gdjIuNC4xLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEluc3RhbmNlRGVmaW5pdGlvbihhcmdzOiB7IHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgcmVmZXJlbmNlIH0gPSBhcmdzO1xuICAgICAgICBpZiAoIXJlZmVyZW5jZT8uaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgcmVmZXJlbmNlLmlkKTtcbiAgICAgICAgICAgIGlmICghZHVtcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGluc3BlY3RvcjogcXVlcnktbm9kZSByZXR1cm5lZCBubyBkdW1wIGZvciAke3JlZmVyZW5jZS5pZH0uIElmIHRoaXMgaXMgYSBjb21wb25lbnQgb3IgYXNzZXQgVVVJRCwgdjIuNC4xIGRvZXMgbm90IHN1cHBvcnQgaXQ7IHBhc3MgdGhlIGhvc3Qgbm9kZSBVVUlEIGluc3RlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gKHJlZmVyZW5jZS50eXBlXG4gICAgICAgICAgICAgICAgfHwgZHVtcC5fX3R5cGVfX1xuICAgICAgICAgICAgICAgIHx8IGR1bXAudHlwZVxuICAgICAgICAgICAgICAgIHx8ICdDb2Nvc0luc3RhbmNlJykucmVwbGFjZSgvXmNjXFwuLywgJycpO1xuICAgICAgICAgICAgLy8gdjIuNC4xOiBxdWVyeS1ub2RlIHJldHVybnMgYSBub2RlIGR1bXAgcmVnYXJkbGVzcyBvZiB3aGF0XG4gICAgICAgICAgICAvLyByZWZlcmVuY2UudHlwZSBjbGFpbXM7IHRydXN0IHRoZSBkdW1wIHNoYXBlIHJhdGhlciB0aGFuXG4gICAgICAgICAgICAvLyB0aGUgY2FsbGVyLXN1cHBsaWVkIHR5cGUgdGFnLlxuICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZSwgZHVtcCwgLyogaXNDb21wb25lbnQgKi8gZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVmZXJlbmNlOiB7IGlkOiByZWZlcmVuY2UuaWQsIHR5cGU6IGR1bXAuX190eXBlX18gPz8gcmVmZXJlbmNlLnR5cGUgfSxcbiAgICAgICAgICAgICAgICAgICAgZGVmaW5pdGlvbjogdHMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBpbnNwZWN0b3I6IHF1ZXJ5LW5vZGUgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBjbGFzcyAke3Nhbml0aXplVHNOYW1lKGNsYXNzTmFtZSl9IHtgKTtcblxuICAgIGNvbnN0IGludGVybmFsS2V5cyA9IGlzQ29tcG9uZW50ID8gQ09NUE9ORU5UX0lOVEVSTkFMX0tFWVMgOiBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUztcbiAgICBmb3IgKGNvbnN0IHByb3BOYW1lIG9mIE9iamVjdC5rZXlzKGR1bXApKSB7XG4gICAgICAgIGlmIChpbnRlcm5hbEtleXMuaGFzKHByb3BOYW1lKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHByb3BFbnRyeSA9IGR1bXBbcHJvcE5hbWVdO1xuICAgICAgICBpZiAocHJvcEVudHJ5ID09PSB1bmRlZmluZWQgfHwgcHJvcEVudHJ5ID09PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgLy8gQ29jb3MgZHVtcCBlbnRyaWVzIGFyZSB0eXBpY2FsbHkgYHt0eXBlLCB2YWx1ZSwgdmlzaWJsZT8sIHJlYWRvbmx5PywgLi4ufWAuXG4gICAgICAgIC8vIFNraXAgZXhwbGljaXRseS1oaWRkZW4gaW5zcGVjdG9yIGZpZWxkczsgdGhleSdyZSBub3QgdXNlci1mYWNpbmcuXG4gICAgICAgIGlmICh0eXBlb2YgcHJvcEVudHJ5ID09PSAnb2JqZWN0JyAmJiBwcm9wRW50cnkudmlzaWJsZSA9PT0gZmFsc2UpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IHRzVHlwZSA9IHJlc29sdmVUc1R5cGUocHJvcEVudHJ5KTtcbiAgICAgICAgY29uc3QgcmVhZG9ubHkgPSBwcm9wRW50cnk/LnJlYWRvbmx5ID8gJ3JlYWRvbmx5ICcgOiAnJztcbiAgICAgICAgY29uc3QgZW51bUhpbnQgPSBlbnVtQ29tbWVudEhpbnQocHJvcEVudHJ5KTtcbiAgICAgICAgY29uc3QgdG9vbHRpcFNyYzogc3RyaW5nIHwgdW5kZWZpbmVkID0gcHJvcEVudHJ5Py50b29sdGlwO1xuICAgICAgICBpZiAodG9vbHRpcFNyYyAmJiB0eXBlb2YgdG9vbHRpcFNyYyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtzYW5pdGl6ZUZvckNvbW1lbnQodG9vbHRpcFNyYyl9ICovYCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVudW1IaW50KSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLyoqICR7ZW51bUhpbnR9ICovYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2FmZVByb3BOYW1lID0gaXNTYWZlVHNJZGVudGlmaWVyKHByb3BOYW1lKSA/IHByb3BOYW1lIDogSlNPTi5zdHJpbmdpZnkocHJvcE5hbWUpO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtyZWFkb25seX0ke3NhZmVQcm9wTmFtZX06ICR7dHNUeXBlfTtgKTtcbiAgICB9XG5cbiAgICBpZiAoIWlzQ29tcG9uZW50ICYmIEFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pICYmIGR1bXAuX19jb21wc19fLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgICAvLyBDb21wb25lbnRzIG9uIHRoaXMgbm9kZSAoaW5zcGVjdCBlYWNoIHNlcGFyYXRlbHkgdmlhIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIHdpdGggdGhlIGhvc3Qgbm9kZSBVVUlEIGZpcnN0OyBjb21wb25lbnQtc3BlY2lmaWMgZHVtcCBhY2Nlc3MgaXMgdjIuNSspOicpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZHVtcC5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIGNvbnN0IGNUeXBlID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy5fX3R5cGVfXyA/PyBjb21wPy50eXBlID8/ICd1bmtub3duJykpO1xuICAgICAgICAgICAgY29uc3QgY1V1aWQgPSBzYW5pdGl6ZUZvckNvbW1lbnQoU3RyaW5nKGNvbXA/LnZhbHVlPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkID8/ICc/JykpO1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8vIC0gJHtjVHlwZX0gIHV1aWQ9JHtjVXVpZH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB0b29sdGlwcyBhbmQgY29tcG9uZW50IG1ldGFkYXRhIGNhblxuLy8gY29udGFpbiBgKi9gIChjbG9zZXMgdGhlIGRvYyBjb21tZW50KSwgYFxcbmAgKGJyZWFrcyBhIGAvL2AgY29tbWVudFxuLy8gaW50byBzdHJheSBjb2RlKSwgb3IgYFxccmAuIFNpbmdsZS1saW5lLWNvbW1lbnQgY29udGV4dCBpcyB0aGVcbi8vIGRhbmdlcm91cyBvbmUuIFN0cmlwIGJvdGguXG5mdW5jdGlvbiBzYW5pdGl6ZUZvckNvbW1lbnQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvXFwqXFwvL2csICcqXFxcXC8nKVxuICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJyAnKTtcbn1cblxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHVuc2FuaXRpemVkIGN1c3RvbS1zY3JpcHQgY2xhc3MgbmFtZXNcbi8vIChlLmcuIGBNeS5Gb29gLCBgTXktRm9vYCkgZW1pdHRlZCBkaXJlY3RseSBpbnRvIHRoZSBUUyBvdXRwdXQgcHJvZHVjZVxuLy8gaW52YWxpZCBUUy4gSlNPTi1zdHJpbmdpZnkgYW55IHByb3BlcnR5IG5hbWUgdGhhdCBpc24ndCBhIHBsYWluIGlkZW50LlxuZnVuY3Rpb24gaXNTYWZlVHNJZGVudGlmaWVyKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAvXltBLVphLXpfJF1bQS1aYS16MC05XyRdKiQvLnRlc3QobmFtZSk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChnZW1pbmkpOiBFbnVtL0JpdE1hc2sgd2VyZSBlbWl0dGVkIGFzIGJhcmVcbi8vIGBudW1iZXJgLiBTdXJmYWNlIHRoZSBlbnVtIGNsYXNzIHZpYSBjb21tZW50IHNvIEFJIGNhbiBsb29rIGl0IHVwXG4vLyByYXRoZXIgdGhhbiBndWVzcy5cbmZ1bmN0aW9uIGVudW1Db21tZW50SGludChlbnRyeTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB0OiBzdHJpbmcgPSBlbnRyeS50eXBlID8/ICcnO1xuICAgIGlmICh0ICE9PSAnRW51bScgJiYgdCAhPT0gJ0JpdE1hc2snKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBlbnVtTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gZW50cnk/LnVzZXJEYXRhPy5lbnVtTmFtZVxuICAgICAgICA/PyBlbnRyeT8udXNlckRhdGE/LmVudW1MaXN0Py5bMF0/Lm5hbWVcbiAgICAgICAgPz8gZW50cnk/LmVudW1OYW1lO1xuICAgIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KGVudHJ5LmVudW1MaXN0KSA/IGVudHJ5LmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeS5iaXRtYXNrTGlzdCkgPyBlbnRyeS5iaXRtYXNrTGlzdFxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3Qgc2FtcGxlID0gbGlzdCAmJiBsaXN0Lmxlbmd0aCA+IDBcbiAgICAgICAgPyBsaXN0LnNsaWNlKDAsIDgpLm1hcCgoaXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbiA9IGl0Py5uYW1lID8/ICc/JztcbiAgICAgICAgICAgIGNvbnN0IHYgPSBpdD8udmFsdWUgPz8gJz8nO1xuICAgICAgICAgICAgcmV0dXJuIGAke259PSR7dn1gO1xuICAgICAgICB9KS5qb2luKCcsICcpXG4gICAgICAgIDogbnVsbDtcbiAgICBpZiAoZW51bU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHNhbml0aXplRm9yQ29tbWVudChgJHt0fTogJHtlbnVtTmFtZX0ke3NhbXBsZSA/IGAg4oCUICR7c2FtcGxlfWAgOiAnJ31gKTtcbiAgICB9XG4gICAgaWYgKHNhbXBsZSkge1xuICAgICAgICByZXR1cm4gc2FuaXRpemVGb3JDb21tZW50KGAke3R9IHZhbHVlczogJHtzYW1wbGV9YCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNUeXBlKGVudHJ5OiBhbnkpOiBzdHJpbmcge1xuICAgIGlmIChlbnRyeSA9PT0gdW5kZWZpbmVkIHx8IGVudHJ5ID09PSBudWxsKSByZXR1cm4gJ3Vua25vd24nO1xuICAgIC8vIFBsYWluIHByaW1pdGl2ZXMgcGFzc2VkIHRocm91Z2ggZGlyZWN0bHkgKHJhcmUgaW4gZHVtcCBzaGFwZSkuXG4gICAgY29uc3QgdHQgPSB0eXBlb2YgZW50cnk7XG4gICAgaWYgKHR0ID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0dCA9PT0gJ251bWJlcicpIHJldHVybiAnbnVtYmVyJztcbiAgICBpZiAodHQgPT09ICdib29sZWFuJykgcmV0dXJuICdib29sZWFuJztcblxuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnkuaXNBcnJheTtcblxuICAgIGxldCB0czogc3RyaW5nO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdTdHJpbmcnOiB0cyA9ICdzdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IHRzID0gJ2Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzInOiB0cyA9ICdWZWMyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzMnOiB0cyA9ICdWZWMzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzQnOiB0cyA9ICdWZWM0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLkNvbG9yJzogdHMgPSAnQ29sb3InOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUmVjdCc6IHRzID0gJ1JlY3QnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuU2l6ZSc6IHRzID0gJ1NpemUnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUXVhdCc6IHRzID0gJ1F1YXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0Myc6IHRzID0gJ01hdDMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0NCc6IHRzID0gJ01hdDQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJzogdHMgPSAndW5rbm93bic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogc2FuaXRpemUgY3VzdG9tIGNsYXNzIG5hbWVzXG4gICAgICAgICAgICAvLyBiZWZvcmUgcGFzdGluZyB0aGVtIGludG8gdGhlIFRTIG91dHB1dC4gYE15LkZvb2AgZXRjLlxuICAgICAgICAgICAgLy8gd291bGQgYmUgaW52YWxpZCBUUyBvdGhlcndpc2UuXG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZFR5cGUgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSkgfHwgJ3Vua25vd24nO1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ0NvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICB0cyA9IGlzUmVmZXJlbmNlID8gYEluc3RhbmNlUmVmZXJlbmNlPCR7c3RyaXBwZWRUeXBlfT5gIDogc3RyaXBwZWRUeXBlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBpc0FycmF5ID8gYEFycmF5PCR7dHN9PmAgOiB0cztcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVUc05hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKC9bXmEtekEtWjAtOV9dL2csICdfJyk7XG59XG4iXX0=