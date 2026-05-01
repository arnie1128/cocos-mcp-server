"use strict";
/**
 * inspector-tools — TypeScript class-definition generator backed by
 * cocos `scene/query-node` dumps.
 *
 * Two MCP tools:
 *   - inspector_get_instance_definition  — for a **node** reference
 *     (component / asset references are deferred to v2.5+ pending a
 *     verified Cocos query-component channel), walk the cocos dump
 *     and emit a TypeScript class declaration AI can read before
 *     changing properties. Avoids the "AI guesses property name"
 *     failure mode.
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
//
// v2.4.2 review fix (codex+claude+gemini): COMPONENT_INTERNAL_KEYS was
// kept in v2.4.1 in anticipation of a v2.5+ component-shaped path, but
// renderTsClass currently only ever runs for nodes. Removed for now;
// when component support comes back, restore from git history rather
// than carry dead code that drifts out of sync with cocos editor.
const NODE_DUMP_INTERNAL_KEYS = new Set([
    '__type__', '__comps__', '__prefab__', '__editorExtras__',
    '_objFlags', '_id', 'uuid',
    'children', 'parent',
    '_prefabInstance', '_prefab', 'mountedRoot', 'mountedChildren',
    'removedComponents', '_components',
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
        var _a, _b, _c, _d;
        const { reference } = args;
        if (!(reference === null || reference === void 0 ? void 0 : reference.id)) {
            return { success: false, error: 'inspector_get_instance_definition: reference.id is required' };
        }
        try {
            const dump = await Editor.Message.request('scene', 'query-node', reference.id);
            if (!dump) {
                return { success: false, error: `inspector: query-node returned no dump for ${reference.id}. If this is a component or asset UUID, v2.4.1 does not support it; pass the host node UUID instead.` };
            }
            // v2.4.2 review fix (codex): trust the dump's __type__, not
            // the caller-supplied reference.type. A caller passing
            // {id: nodeUuid, type: 'cc.Sprite'} otherwise got a node
            // dump rendered as `class Sprite`, mislabelling the
            // declaration entirely. reference.type is now diagnostic
            // only — surfaced in the response data so callers can see
            // a mismatch but never used as the class name.
            const dumpType = String((_b = (_a = dump.__type__) !== null && _a !== void 0 ? _a : dump.type) !== null && _b !== void 0 ? _b : 'CocosInstance');
            const className = dumpType.replace(/^cc\./, '');
            const referenceTypeMismatch = reference.type
                && reference.type !== dumpType
                && reference.type.replace(/^cc\./, '') !== className;
            const ts = renderTsClass(className, dump, /* isComponent */ false);
            const response = {
                success: true,
                data: {
                    reference: { id: reference.id, type: (_c = dump.__type__) !== null && _c !== void 0 ? _c : reference.type },
                    definition: ts,
                },
            };
            if (referenceTypeMismatch) {
                response.warning = `inspector: reference.type (${reference.type}) does not match dump __type__ (${dumpType}); class label uses the dump value`;
            }
            return response;
        }
        catch (err) {
            return { success: false, error: `inspector: query-node failed: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}` };
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
function renderTsClass(className, dump, _isComponent) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // v2.4.2: _isComponent kept for forward-compat signature stability;
    // currently always false. v2.5+ will reintroduce a component branch.
    const lines = [];
    lines.push(`class ${sanitizeTsName(className)} {`);
    for (const propName of Object.keys(dump)) {
        if (NODE_DUMP_INTERNAL_KEYS.has(propName))
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
    if (Array.isArray(dump.__comps__) && dump.__comps__.length > 0) {
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
    var _a, _b, _c, _d, _e;
    if (!entry || typeof entry !== 'object')
        return null;
    const t = (_a = entry.type) !== null && _a !== void 0 ? _a : '';
    if (t !== 'Enum' && t !== 'BitMask')
        return null;
    // v2.4.2 review fix (claude): the v2.4.1 fallback included
    // `userData.enumList[0].name` which is the *first enum value's*
    // name, not the enum class name — produced misleading comments.
    // Drop that path; only use explicit enumName fields.
    const enumName = (_c = (_b = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _b === void 0 ? void 0 : _b.enumName) !== null && _c !== void 0 ? _c : entry === null || entry === void 0 ? void 0 : entry.enumName;
    // v2.4.2 review fix (codex): cocos sometimes nests enumList /
    // bitmaskList under userData, sometimes at the top level. Check
    // both before giving up.
    const list = Array.isArray(entry.enumList) ? entry.enumList
        : Array.isArray(entry.bitmaskList) ? entry.bitmaskList
            : Array.isArray((_d = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _d === void 0 ? void 0 : _d.enumList) ? entry.userData.enumList
                : Array.isArray((_e = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _e === void 0 ? void 0 : _e.bitmaskList) ? entry.userData.bitmaskList
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
// v2.4.2 review fix (codex): the v2.4.1 implementation only stripped
// non-identifier characters but didn't guard against a digit-leading
// result (`class 2dSprite`) or an empty result (after stripping all
// chars in a UUID-shaped __type__). Both produce invalid TS. Prefix
// digit-leading and empty cases with `_` / `_Unknown`.
function sanitizeTsName(name) {
    const cleaned = String(name !== null && name !== void 0 ? name : '').replace(/[^a-zA-Z0-9_]/g, '_');
    if (cleaned.length === 0)
        return '_Unknown';
    if (/^[0-9]/.test(cleaned))
        return `_${cleaned}`;
    return cleaned;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7Ozs7Ozs7OztBQUdILDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBRXZGLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsdUVBQXVFO0FBQ3ZFLHFFQUFxRTtBQUNyRSxxRUFBcUU7QUFDckUsa0VBQWtFO0FBQ2xFLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEMsVUFBVSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsa0JBQWtCO0lBQ3pELFdBQVcsRUFBRSxLQUFLLEVBQUUsTUFBTTtJQUMxQixVQUFVLEVBQUUsUUFBUTtJQUNwQixpQkFBaUIsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLGlCQUFpQjtJQUM5RCxtQkFBbUIsRUFBRSxhQUFhO0NBQ3JDLENBQUMsQ0FBQztBQUVILE1BQWEsY0FBYztJQUd2QjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBT25HLEFBQU4sS0FBSyxDQUFD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QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogaW5zcGVjdG9yLXRvb2xzIOKAlCBUeXBlU2NyaXB0IGNsYXNzLWRlZmluaXRpb24gZ2VuZXJhdG9yIGJhY2tlZCBieVxuICogY29jb3MgYHNjZW5lL3F1ZXJ5LW5vZGVgIGR1bXBzLlxuICpcbiAqIFR3byBNQ1AgdG9vbHM6XG4gKiAgIC0gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uICDigJQgZm9yIGEgKipub2RlKiogcmVmZXJlbmNlXG4gKiAgICAgKGNvbXBvbmVudCAvIGFzc2V0IHJlZmVyZW5jZXMgYXJlIGRlZmVycmVkIHRvIHYyLjUrIHBlbmRpbmcgYVxuICogICAgIHZlcmlmaWVkIENvY29zIHF1ZXJ5LWNvbXBvbmVudCBjaGFubmVsKSwgd2FsayB0aGUgY29jb3MgZHVtcFxuICogICAgIGFuZCBlbWl0IGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBBSSBjYW4gcmVhZCBiZWZvcmVcbiAqICAgICBjaGFuZ2luZyBwcm9wZXJ0aWVzLiBBdm9pZHMgdGhlIFwiQUkgZ3Vlc3NlcyBwcm9wZXJ0eSBuYW1lXCJcbiAqICAgICBmYWlsdXJlIG1vZGUuXG4gKiAgIC0gaW5zcGVjdG9yX2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiDigJQgcmV0dXJuIGhhcmRjb2RlZFxuICogICAgIGRlZmluaXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBldGMuKVxuICogICAgIHRoYXQgdGhlIGluc3RhbmNlIGRlZmluaXRpb24gcmVmZXJlbmNlcyBidXQgZG9lc24ndCBpbmxpbmUuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdilcbiAqIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGUvc291cmNlL3V0Y3AvdG9vbHMvdHlwZXNjcmlwdC1kZWZlbml0aW9uLnRzYC5cbiAqIE91ciBpbXBsIGlzIGludGVudGlvbmFsbHkgYSBiYXNpYyB3YWxrIOKAlCBoYW5kbGVzIHByb3BlcnR5IG5hbWUgKyB0eXBlXG4gKiArIGFycmF5ICsgcmVmZXJlbmNlOyBkZWZlcnMgZW51bS9zdHJ1Y3QgaG9pc3RpbmcgYW5kIHBlci1hdHRyaWJ1dGVcbiAqIGRlY29yYXRvcnMgdG8gbGF0ZXIgcGF0Y2hlcy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIEBtY3BUb29sIGRlY29yYXRvciAodjIuNC4wIHN0ZXAgNSkuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuXG5jb25zdCBDT01NT05fVFlQRVNfREVGSU5JVElPTiA9IGAvLyBDb2NvcyBjb21tb24gdmFsdWUgdHlwZXMg4oCUIHJlZmVyZW5jZWQgYnkgaW5zdGFuY2UgZGVmaW5pdGlvbnMuXG50eXBlIEluc3RhbmNlUmVmZXJlbmNlPFQgPSB1bmtub3duPiA9IHsgaWQ6IHN0cmluZzsgdHlwZT86IHN0cmluZyB9O1xuY2xhc3MgVmVjMiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB9XG5jbGFzcyBWZWMzIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfVxuY2xhc3MgVmVjNCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgQ29sb3IgeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXI7IH1cbmNsYXNzIFJlY3QgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFNpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgUXVhdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgTWF0MyB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7XG4gIG0wMzogbnVtYmVyOyBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7XG4gIG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjsgbTA4OiBudW1iZXI7IH1cbmNsYXNzIE1hdDQgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyOyBtMDM6IG51bWJlcjtcbiAgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyOyBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7XG4gIG0wODogbnVtYmVyOyBtMDk6IG51bWJlcjsgbTEwOiBudW1iZXI7IG0xMTogbnVtYmVyO1xuICBtMTI6IG51bWJlcjsgbTEzOiBudW1iZXI7IG0xNDogbnVtYmVyOyBtMTU6IG51bWJlcjsgfVxuYDtcblxuLy8gTmFtZXMgdGhhdCBzaG93IHVwIGF0IHRoZSB0b3Agb2YgZXZlcnkgbm9kZSBkdW1wIGJ1dCBhcmVuJ3Rcbi8vIHVzZXItZmFjaW5nIHByb3BlcnRpZXM7IHN1cHByZXNzIGZyb20gZ2VuZXJhdGVkIGRlZmluaXRpb25zLlxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNvZGV4KTogZXhwYW5kZWQgZnJvbSB0aGUgdjIuNC4wIG1pbmltYWwgbGlzdCB0b1xuLy8gY292ZXIgcHJlZmFiLWluc3RhbmNlL3NlcmlhbGl6YXRpb24gbWV0YWRhdGEgYW5kIGVkaXRvci1vbmx5IGZpZWxkc1xuLy8gdGhhdCBBSSBzaG91bGRuJ3QgdHJ5IHRvIG11dGF0ZS5cbi8vXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgrY2xhdWRlK2dlbWluaSk6IENPTVBPTkVOVF9JTlRFUk5BTF9LRVlTIHdhc1xuLy8ga2VwdCBpbiB2Mi40LjEgaW4gYW50aWNpcGF0aW9uIG9mIGEgdjIuNSsgY29tcG9uZW50LXNoYXBlZCBwYXRoLCBidXRcbi8vIHJlbmRlclRzQ2xhc3MgY3VycmVudGx5IG9ubHkgZXZlciBydW5zIGZvciBub2Rlcy4gUmVtb3ZlZCBmb3Igbm93O1xuLy8gd2hlbiBjb21wb25lbnQgc3VwcG9ydCBjb21lcyBiYWNrLCByZXN0b3JlIGZyb20gZ2l0IGhpc3RvcnkgcmF0aGVyXG4vLyB0aGFuIGNhcnJ5IGRlYWQgY29kZSB0aGF0IGRyaWZ0cyBvdXQgb2Ygc3luYyB3aXRoIGNvY29zIGVkaXRvci5cbmNvbnN0IE5PREVfRFVNUF9JTlRFUk5BTF9LRVlTID0gbmV3IFNldChbXG4gICAgJ19fdHlwZV9fJywgJ19fY29tcHNfXycsICdfX3ByZWZhYl9fJywgJ19fZWRpdG9yRXh0cmFzX18nLFxuICAgICdfb2JqRmxhZ3MnLCAnX2lkJywgJ3V1aWQnLFxuICAgICdjaGlsZHJlbicsICdwYXJlbnQnLFxuICAgICdfcHJlZmFiSW5zdGFuY2UnLCAnX3ByZWZhYicsICdtb3VudGVkUm9vdCcsICdtb3VudGVkQ2hpbGRyZW4nLFxuICAgICdyZW1vdmVkQ29tcG9uZW50cycsICdfY29tcG9uZW50cycsXG5dKTtcblxuZXhwb3J0IGNsYXNzIEluc3BlY3RvclRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIGhhcmRjb2RlZCBUeXBlU2NyaXB0IGRlY2xhcmF0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgU2l6ZSwgUXVhdCwgTWF0My80KSBhbmQgdGhlIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLiBBSSBjYW4gcHJlcGVuZCB0aGlzIHRvIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiBvdXRwdXQgYmVmb3JlIGdlbmVyYXRpbmcgdHlwZS1zYWZlIGNvZGUuIE5vIHNjZW5lIHF1ZXJ5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRDb21tb25UeXBlc0RlZmluaXRpb24oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2luc3RhbmNlX2RlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBmb3IgYSBzY2VuZSBub2RlLCBkZXJpdmVkIGZyb20gdGhlIGxpdmUgY29jb3Mgc2NlbmUvcXVlcnktbm9kZSBkdW1wLiBUaGUgZ2VuZXJhdGVkIGNsYXNzIGluY2x1ZGVzIGEgY29tbWVudCBsaXN0aW5nIHRoZSBjb21wb25lbnRzIGF0dGFjaGVkIHRvIHRoZSBub2RlICh3aXRoIFVVSURzKS4gQUkgc2hvdWxkIGNhbGwgdGhpcyBCRUZPUkUgd3JpdGluZyBwcm9wZXJ0aWVzIHNvIGl0IHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIHdpdGggZ2V0X2NvbW1vbl90eXBlc19kZWZpbml0aW9uIGZvciBWZWMyL0NvbG9yL2V0YyByZWZlcmVuY2VzLiB2Mi40LjEgbm90ZTogb25seSBub2RlLXNoYXBlZCByZWZlcmVuY2VzIGFyZSBpbnNwZWN0ZWQgaGVyZSDigJQgY29tcG9uZW50L2Fzc2V0IGRlZmluaXRpb24gc3VwcG9ydCBpcyBkZWZlcnJlZCB1bnRpbCBhIHZlcmlmaWVkIENvY29zIHF1ZXJ5LWNvbXBvbmVudCBjaGFubmVsIGlzIHdpcmVkLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLmRlc2NyaWJlKCdUYXJnZXQgbm9kZS4ge2lkfSA9IG5vZGUgVVVJRCwge3R5cGV9IG9wdGlvbmFsIGNjIGNsYXNzIGxhYmVsLiBDb21wb25lbnQgb3IgYXNzZXQgcmVmZXJlbmNlcyB3aWxsIHJldHVybiBhbiBlcnJvciBpbiB2Mi40LjEuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0SW5zdGFuY2VEZWZpbml0aW9uKGFyZ3M6IHsgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uOiByZWZlcmVuY2UuaWQgaXMgcmVxdWlyZWQnIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCByZWZlcmVuY2UuaWQpO1xuICAgICAgICAgICAgaWYgKCFkdW1wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgaW5zcGVjdG9yOiBxdWVyeS1ub2RlIHJldHVybmVkIG5vIGR1bXAgZm9yICR7cmVmZXJlbmNlLmlkfS4gSWYgdGhpcyBpcyBhIGNvbXBvbmVudCBvciBhc3NldCBVVUlELCB2Mi40LjEgZG9lcyBub3Qgc3VwcG9ydCBpdDsgcGFzcyB0aGUgaG9zdCBub2RlIFVVSUQgaW5zdGVhZC5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0cnVzdCB0aGUgZHVtcCdzIF9fdHlwZV9fLCBub3RcbiAgICAgICAgICAgIC8vIHRoZSBjYWxsZXItc3VwcGxpZWQgcmVmZXJlbmNlLnR5cGUuIEEgY2FsbGVyIHBhc3NpbmdcbiAgICAgICAgICAgIC8vIHtpZDogbm9kZVV1aWQsIHR5cGU6ICdjYy5TcHJpdGUnfSBvdGhlcndpc2UgZ290IGEgbm9kZVxuICAgICAgICAgICAgLy8gZHVtcCByZW5kZXJlZCBhcyBgY2xhc3MgU3ByaXRlYCwgbWlzbGFiZWxsaW5nIHRoZVxuICAgICAgICAgICAgLy8gZGVjbGFyYXRpb24gZW50aXJlbHkuIHJlZmVyZW5jZS50eXBlIGlzIG5vdyBkaWFnbm9zdGljXG4gICAgICAgICAgICAvLyBvbmx5IOKAlCBzdXJmYWNlZCBpbiB0aGUgcmVzcG9uc2UgZGF0YSBzbyBjYWxsZXJzIGNhbiBzZWVcbiAgICAgICAgICAgIC8vIGEgbWlzbWF0Y2ggYnV0IG5ldmVyIHVzZWQgYXMgdGhlIGNsYXNzIG5hbWUuXG4gICAgICAgICAgICBjb25zdCBkdW1wVHlwZSA9IFN0cmluZyhkdW1wLl9fdHlwZV9fID8/IGR1bXAudHlwZSA/PyAnQ29jb3NJbnN0YW5jZScpO1xuICAgICAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gZHVtcFR5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpO1xuICAgICAgICAgICAgY29uc3QgcmVmZXJlbmNlVHlwZU1pc21hdGNoID0gcmVmZXJlbmNlLnR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZSAhPT0gZHVtcFR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykgIT09IGNsYXNzTmFtZTtcbiAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWUsIGR1bXAsIC8qIGlzQ29tcG9uZW50ICovIGZhbHNlKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiBkdW1wLl9fdHlwZV9fID8/IHJlZmVyZW5jZS50eXBlIH0sXG4gICAgICAgICAgICAgICAgICAgIGRlZmluaXRpb246IHRzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJlZmVyZW5jZVR5cGVNaXNtYXRjaCkge1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLndhcm5pbmcgPSBgaW5zcGVjdG9yOiByZWZlcmVuY2UudHlwZSAoJHtyZWZlcmVuY2UudHlwZX0pIGRvZXMgbm90IG1hdGNoIGR1bXAgX190eXBlX18gKCR7ZHVtcFR5cGV9KTsgY2xhc3MgbGFiZWwgdXNlcyB0aGUgZHVtcCB2YWx1ZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBpbnNwZWN0b3I6IHF1ZXJ5LW5vZGUgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIF9pc0NvbXBvbmVudDogYm9vbGVhbik6IHN0cmluZyB7XG4gICAgLy8gdjIuNC4yOiBfaXNDb21wb25lbnQga2VwdCBmb3IgZm9yd2FyZC1jb21wYXQgc2lnbmF0dXJlIHN0YWJpbGl0eTtcbiAgICAvLyBjdXJyZW50bHkgYWx3YXlzIGZhbHNlLiB2Mi41KyB3aWxsIHJlaW50cm9kdWNlIGEgY29tcG9uZW50IGJyYW5jaC5cbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBjbGFzcyAke3Nhbml0aXplVHNOYW1lKGNsYXNzTmFtZSl9IHtgKTtcblxuICAgIGZvciAoY29uc3QgcHJvcE5hbWUgb2YgT2JqZWN0LmtleXMoZHVtcCkpIHtcbiAgICAgICAgaWYgKE5PREVfRFVNUF9JTlRFUk5BTF9LRVlTLmhhcyhwcm9wTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBwcm9wRW50cnkgPSBkdW1wW3Byb3BOYW1lXTtcbiAgICAgICAgaWYgKHByb3BFbnRyeSA9PT0gdW5kZWZpbmVkIHx8IHByb3BFbnRyeSA9PT0gbnVsbCkgY29udGludWU7XG4gICAgICAgIC8vIENvY29zIGR1bXAgZW50cmllcyBhcmUgdHlwaWNhbGx5IGB7dHlwZSwgdmFsdWUsIHZpc2libGU/LCByZWFkb25seT8sIC4uLn1gLlxuICAgICAgICAvLyBTa2lwIGV4cGxpY2l0bHktaGlkZGVuIGluc3BlY3RvciBmaWVsZHM7IHRoZXkncmUgbm90IHVzZXItZmFjaW5nLlxuICAgICAgICBpZiAodHlwZW9mIHByb3BFbnRyeSA9PT0gJ29iamVjdCcgJiYgcHJvcEVudHJ5LnZpc2libGUgPT09IGZhbHNlKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0c1R5cGUgPSByZXNvbHZlVHNUeXBlKHByb3BFbnRyeSk7XG4gICAgICAgIGNvbnN0IHJlYWRvbmx5ID0gcHJvcEVudHJ5Py5yZWFkb25seSA/ICdyZWFkb25seSAnIDogJyc7XG4gICAgICAgIGNvbnN0IGVudW1IaW50ID0gZW51bUNvbW1lbnRIaW50KHByb3BFbnRyeSk7XG4gICAgICAgIGNvbnN0IHRvb2x0aXBTcmM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHByb3BFbnRyeT8udG9vbHRpcDtcbiAgICAgICAgaWYgKHRvb2x0aXBTcmMgJiYgdHlwZW9mIHRvb2x0aXBTcmMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLyoqICR7c2FuaXRpemVGb3JDb21tZW50KHRvb2x0aXBTcmMpfSAqL2ApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlbnVtSGludCkge1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8qKiAke2VudW1IaW50fSAqL2ApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNhZmVQcm9wTmFtZSA9IGlzU2FmZVRzSWRlbnRpZmllcihwcm9wTmFtZSkgPyBwcm9wTmFtZSA6IEpTT04uc3RyaW5naWZ5KHByb3BOYW1lKTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICR7cmVhZG9ubHl9JHtzYWZlUHJvcE5hbWV9OiAke3RzVHlwZX07YCk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pICYmIGR1bXAuX19jb21wc19fLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgICAvLyBDb21wb25lbnRzIG9uIHRoaXMgbm9kZSAoaW5zcGVjdCBlYWNoIHNlcGFyYXRlbHkgdmlhIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIHdpdGggdGhlIGhvc3Qgbm9kZSBVVUlEIGZpcnN0OyBjb21wb25lbnQtc3BlY2lmaWMgZHVtcCBhY2Nlc3MgaXMgdjIuNSspOicpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZHVtcC5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIGNvbnN0IGNUeXBlID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy5fX3R5cGVfXyA/PyBjb21wPy50eXBlID8/ICd1bmtub3duJykpO1xuICAgICAgICAgICAgY29uc3QgY1V1aWQgPSBzYW5pdGl6ZUZvckNvbW1lbnQoU3RyaW5nKGNvbXA/LnZhbHVlPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkID8/ICc/JykpO1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8vIC0gJHtjVHlwZX0gIHV1aWQ9JHtjVXVpZH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB0b29sdGlwcyBhbmQgY29tcG9uZW50IG1ldGFkYXRhIGNhblxuLy8gY29udGFpbiBgKi9gIChjbG9zZXMgdGhlIGRvYyBjb21tZW50KSwgYFxcbmAgKGJyZWFrcyBhIGAvL2AgY29tbWVudFxuLy8gaW50byBzdHJheSBjb2RlKSwgb3IgYFxccmAuIFNpbmdsZS1saW5lLWNvbW1lbnQgY29udGV4dCBpcyB0aGVcbi8vIGRhbmdlcm91cyBvbmUuIFN0cmlwIGJvdGguXG5mdW5jdGlvbiBzYW5pdGl6ZUZvckNvbW1lbnQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvXFwqXFwvL2csICcqXFxcXC8nKVxuICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJyAnKTtcbn1cblxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHVuc2FuaXRpemVkIGN1c3RvbS1zY3JpcHQgY2xhc3MgbmFtZXNcbi8vIChlLmcuIGBNeS5Gb29gLCBgTXktRm9vYCkgZW1pdHRlZCBkaXJlY3RseSBpbnRvIHRoZSBUUyBvdXRwdXQgcHJvZHVjZVxuLy8gaW52YWxpZCBUUy4gSlNPTi1zdHJpbmdpZnkgYW55IHByb3BlcnR5IG5hbWUgdGhhdCBpc24ndCBhIHBsYWluIGlkZW50LlxuZnVuY3Rpb24gaXNTYWZlVHNJZGVudGlmaWVyKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAvXltBLVphLXpfJF1bQS1aYS16MC05XyRdKiQvLnRlc3QobmFtZSk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChnZW1pbmkpOiBFbnVtL0JpdE1hc2sgd2VyZSBlbWl0dGVkIGFzIGJhcmVcbi8vIGBudW1iZXJgLiBTdXJmYWNlIHRoZSBlbnVtIGNsYXNzIHZpYSBjb21tZW50IHNvIEFJIGNhbiBsb29rIGl0IHVwXG4vLyByYXRoZXIgdGhhbiBndWVzcy5cbmZ1bmN0aW9uIGVudW1Db21tZW50SGludChlbnRyeTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB0OiBzdHJpbmcgPSBlbnRyeS50eXBlID8/ICcnO1xuICAgIGlmICh0ICE9PSAnRW51bScgJiYgdCAhPT0gJ0JpdE1hc2snKSByZXR1cm4gbnVsbDtcbiAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY2xhdWRlKTogdGhlIHYyLjQuMSBmYWxsYmFjayBpbmNsdWRlZFxuICAgIC8vIGB1c2VyRGF0YS5lbnVtTGlzdFswXS5uYW1lYCB3aGljaCBpcyB0aGUgKmZpcnN0IGVudW0gdmFsdWUncypcbiAgICAvLyBuYW1lLCBub3QgdGhlIGVudW0gY2xhc3MgbmFtZSDigJQgcHJvZHVjZWQgbWlzbGVhZGluZyBjb21tZW50cy5cbiAgICAvLyBEcm9wIHRoYXQgcGF0aDsgb25seSB1c2UgZXhwbGljaXQgZW51bU5hbWUgZmllbGRzLlxuICAgIGNvbnN0IGVudW1OYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBlbnRyeT8udXNlckRhdGE/LmVudW1OYW1lXG4gICAgICAgID8/IGVudHJ5Py5lbnVtTmFtZTtcbiAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiBjb2NvcyBzb21ldGltZXMgbmVzdHMgZW51bUxpc3QgL1xuICAgIC8vIGJpdG1hc2tMaXN0IHVuZGVyIHVzZXJEYXRhLCBzb21ldGltZXMgYXQgdGhlIHRvcCBsZXZlbC4gQ2hlY2tcbiAgICAvLyBib3RoIGJlZm9yZSBnaXZpbmcgdXAuXG4gICAgY29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkoZW50cnkuZW51bUxpc3QpID8gZW50cnkuZW51bUxpc3RcbiAgICAgICAgOiBBcnJheS5pc0FycmF5KGVudHJ5LmJpdG1hc2tMaXN0KSA/IGVudHJ5LmJpdG1hc2tMaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeT8udXNlckRhdGE/LmVudW1MaXN0KSA/IGVudHJ5LnVzZXJEYXRhLmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeT8udXNlckRhdGE/LmJpdG1hc2tMaXN0KSA/IGVudHJ5LnVzZXJEYXRhLmJpdG1hc2tMaXN0XG4gICAgICAgIDogbnVsbDtcbiAgICBjb25zdCBzYW1wbGUgPSBsaXN0ICYmIGxpc3QubGVuZ3RoID4gMFxuICAgICAgICA/IGxpc3Quc2xpY2UoMCwgOCkubWFwKChpdDogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuID0gaXQ/Lm5hbWUgPz8gJz8nO1xuICAgICAgICAgICAgY29uc3QgdiA9IGl0Py52YWx1ZSA/PyAnPyc7XG4gICAgICAgICAgICByZXR1cm4gYCR7bn09JHt2fWA7XG4gICAgICAgIH0pLmpvaW4oJywgJylcbiAgICAgICAgOiBudWxsO1xuICAgIGlmIChlbnVtTmFtZSkge1xuICAgICAgICByZXR1cm4gc2FuaXRpemVGb3JDb21tZW50KGAke3R9OiAke2VudW1OYW1lfSR7c2FtcGxlID8gYCDigJQgJHtzYW1wbGV9YCA6ICcnfWApO1xuICAgIH1cbiAgICBpZiAoc2FtcGxlKSB7XG4gICAgICAgIHJldHVybiBzYW5pdGl6ZUZvckNvbW1lbnQoYCR7dH0gdmFsdWVzOiAke3NhbXBsZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUc1R5cGUoZW50cnk6IGFueSk6IHN0cmluZyB7XG4gICAgaWYgKGVudHJ5ID09PSB1bmRlZmluZWQgfHwgZW50cnkgPT09IG51bGwpIHJldHVybiAndW5rbm93bic7XG4gICAgLy8gUGxhaW4gcHJpbWl0aXZlcyBwYXNzZWQgdGhyb3VnaCBkaXJlY3RseSAocmFyZSBpbiBkdW1wIHNoYXBlKS5cbiAgICBjb25zdCB0dCA9IHR5cGVvZiBlbnRyeTtcbiAgICBpZiAodHQgPT09ICdzdHJpbmcnKSByZXR1cm4gJ3N0cmluZyc7XG4gICAgaWYgKHR0ID09PSAnbnVtYmVyJykgcmV0dXJuICdudW1iZXInO1xuICAgIGlmICh0dCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xuXG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcbiAgICBjb25zdCBpc0FycmF5ID0gISFlbnRyeS5pc0FycmF5O1xuXG4gICAgbGV0IHRzOiBzdHJpbmc7XG4gICAgc3dpdGNoIChyYXdUeXBlKSB7XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6IHRzID0gJ3N0cmluZyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdCb29sZWFuJzogdHMgPSAnYm9vbGVhbic7IGJyZWFrO1xuICAgICAgICBjYXNlICdJbnRlZ2VyJzpcbiAgICAgICAgY2FzZSAnRmxvYXQnOlxuICAgICAgICBjYXNlICdOdW1iZXInOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgIGNhc2UgJ0JpdE1hc2snOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMic6IHRzID0gJ1ZlYzInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMyc6IHRzID0gJ1ZlYzMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjNCc6IHRzID0gJ1ZlYzQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuQ29sb3InOiB0cyA9ICdDb2xvcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5SZWN0JzogdHMgPSAnUmVjdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5TaXplJzogdHMgPSAnU2l6ZSc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5RdWF0JzogdHMgPSAnUXVhdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQzJzogdHMgPSAnTWF0Myc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQ0JzogdHMgPSAnTWF0NCc7IGJyZWFrO1xuICAgICAgICBjYXNlICcnOiB0cyA9ICd1bmtub3duJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIC8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiBzYW5pdGl6ZSBjdXN0b20gY2xhc3MgbmFtZXNcbiAgICAgICAgICAgIC8vIGJlZm9yZSBwYXN0aW5nIHRoZW0gaW50byB0aGUgVFMgb3V0cHV0LiBgTXkuRm9vYCBldGMuXG4gICAgICAgICAgICAvLyB3b3VsZCBiZSBpbnZhbGlkIFRTIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGNvbnN0IHN0cmlwcGVkVHlwZSA9IHNhbml0aXplVHNOYW1lKHJhd1R5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpKSB8fCAndW5rbm93bic7XG4gICAgICAgICAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgaXNSZWZlcmVuY2UgPSBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Db21wb25lbnQnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcbiAgICAgICAgICAgIHRzID0gaXNSZWZlcmVuY2UgPyBgSW5zdGFuY2VSZWZlcmVuY2U8JHtzdHJpcHBlZFR5cGV9PmAgOiBzdHJpcHBlZFR5cGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGlzQXJyYXkgPyBgQXJyYXk8JHt0c30+YCA6IHRzO1xufVxuXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0aGUgdjIuNC4xIGltcGxlbWVudGF0aW9uIG9ubHkgc3RyaXBwZWRcbi8vIG5vbi1pZGVudGlmaWVyIGNoYXJhY3RlcnMgYnV0IGRpZG4ndCBndWFyZCBhZ2FpbnN0IGEgZGlnaXQtbGVhZGluZ1xuLy8gcmVzdWx0IChgY2xhc3MgMmRTcHJpdGVgKSBvciBhbiBlbXB0eSByZXN1bHQgKGFmdGVyIHN0cmlwcGluZyBhbGxcbi8vIGNoYXJzIGluIGEgVVVJRC1zaGFwZWQgX190eXBlX18pLiBCb3RoIHByb2R1Y2UgaW52YWxpZCBUUy4gUHJlZml4XG4vLyBkaWdpdC1sZWFkaW5nIGFuZCBlbXB0eSBjYXNlcyB3aXRoIGBfYCAvIGBfVW5rbm93bmAuXG5mdW5jdGlvbiBzYW5pdGl6ZVRzTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBTdHJpbmcobmFtZSA/PyAnJykucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCAnXycpO1xuICAgIGlmIChjbGVhbmVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdfVW5rbm93bic7XG4gICAgaWYgKC9eWzAtOV0vLnRlc3QoY2xlYW5lZCkpIHJldHVybiBgXyR7Y2xlYW5lZH1gO1xuICAgIHJldHVybiBjbGVhbmVkO1xufVxuIl19