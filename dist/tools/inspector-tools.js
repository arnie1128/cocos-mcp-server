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
        title: 'Read cocos common types',
        description: 'Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query.',
        inputSchema: schema_1.z.object({}),
    })
], InspectorTools.prototype, "getCommonTypesDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_instance_definition',
        title: 'Read instance TS definition',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7Ozs7Ozs7OztBQUdILDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBRXZGLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsdUVBQXVFO0FBQ3ZFLHFFQUFxRTtBQUNyRSxxRUFBcUU7QUFDckUsa0VBQWtFO0FBQ2xFLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEMsVUFBVSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsa0JBQWtCO0lBQ3pELFdBQVcsRUFBRSxLQUFLLEVBQUUsTUFBTTtJQUMxQixVQUFVLEVBQUUsUUFBUTtJQUNwQixpQkFBaUIsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLGlCQUFpQjtJQUM5RCxtQkFBbUIsRUFBRSxhQUFhO0NBQ3JDLENBQUMsQ0FBQztBQUVILE1BQWEsY0FBYztJQUd2QjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBUW5HLEFBQU4sS0FBSyxDQUFD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T0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBQ2pELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGluc3BlY3Rvci10b29scyDigJQgVHlwZVNjcmlwdCBjbGFzcy1kZWZpbml0aW9uIGdlbmVyYXRvciBiYWNrZWQgYnlcbiAqIGNvY29zIGBzY2VuZS9xdWVyeS1ub2RlYCBkdW1wcy5cbiAqXG4gKiBUd28gTUNQIHRvb2xzOlxuICogICAtIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiAg4oCUIGZvciBhICoqbm9kZSoqIHJlZmVyZW5jZVxuICogICAgIChjb21wb25lbnQgLyBhc3NldCByZWZlcmVuY2VzIGFyZSBkZWZlcnJlZCB0byB2Mi41KyBwZW5kaW5nIGFcbiAqICAgICB2ZXJpZmllZCBDb2NvcyBxdWVyeS1jb21wb25lbnQgY2hhbm5lbCksIHdhbGsgdGhlIGNvY29zIGR1bXBcbiAqICAgICBhbmQgZW1pdCBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gQUkgY2FuIHJlYWQgYmVmb3JlXG4gKiAgICAgY2hhbmdpbmcgcHJvcGVydGllcy4gQXZvaWRzIHRoZSBcIkFJIGd1ZXNzZXMgcHJvcGVydHkgbmFtZVwiXG4gKiAgICAgZmFpbHVyZSBtb2RlLlxuICogICAtIGluc3BlY3Rvcl9nZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24g4oCUIHJldHVybiBoYXJkY29kZWRcbiAqICAgICBkZWZpbml0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgZXRjLilcbiAqICAgICB0aGF0IHRoZSBpbnN0YW5jZSBkZWZpbml0aW9uIHJlZmVyZW5jZXMgYnV0IGRvZXNuJ3QgaW5saW5lLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtY29kZS1tb2RlIChSb21hUm9nb3YpXG4gKiBgRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvY29jb3MtY29kZS1tb2RlL3NvdXJjZS91dGNwL3Rvb2xzL3R5cGVzY3JpcHQtZGVmZW5pdGlvbi50c2AuXG4gKiBPdXIgaW1wbCBpcyBpbnRlbnRpb25hbGx5IGEgYmFzaWMgd2FsayDigJQgaGFuZGxlcyBwcm9wZXJ0eSBuYW1lICsgdHlwZVxuICogKyBhcnJheSArIHJlZmVyZW5jZTsgZGVmZXJzIGVudW0vc3RydWN0IGhvaXN0aW5nIGFuZCBwZXItYXR0cmlidXRlXG4gKiBkZWNvcmF0b3JzIHRvIGxhdGVyIHBhdGNoZXMuXG4gKlxuICogRGVtb25zdHJhdGVzIHRoZSBAbWNwVG9vbCBkZWNvcmF0b3IgKHYyLjQuMCBzdGVwIDUpLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgSW5zdGFuY2VSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcblxuY29uc3QgQ09NTU9OX1RZUEVTX0RFRklOSVRJT04gPSBgLy8gQ29jb3MgY29tbW9uIHZhbHVlIHR5cGVzIOKAlCByZWZlcmVuY2VkIGJ5IGluc3RhbmNlIGRlZmluaXRpb25zLlxudHlwZSBJbnN0YW5jZVJlZmVyZW5jZTxUID0gdW5rbm93bj4gPSB7IGlkOiBzdHJpbmc7IHR5cGU/OiBzdHJpbmcgfTtcbmNsYXNzIFZlYzIgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgfVxuY2xhc3MgVmVjMyB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH1cbmNsYXNzIFZlYzQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIENvbG9yIHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyOyB9XG5jbGFzcyBSZWN0IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9XG5jbGFzcyBTaXplIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFF1YXQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIE1hdDMgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyO1xuICBtMDM6IG51bWJlcjsgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyO1xuICBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7IG0wODogbnVtYmVyOyB9XG5jbGFzcyBNYXQ0IHsgbTAwOiBudW1iZXI7IG0wMTogbnVtYmVyOyBtMDI6IG51bWJlcjsgbTAzOiBudW1iZXI7XG4gIG0wNDogbnVtYmVyOyBtMDU6IG51bWJlcjsgbTA2OiBudW1iZXI7IG0wNzogbnVtYmVyO1xuICBtMDg6IG51bWJlcjsgbTA5OiBudW1iZXI7IG0xMDogbnVtYmVyOyBtMTE6IG51bWJlcjtcbiAgbTEyOiBudW1iZXI7IG0xMzogbnVtYmVyOyBtMTQ6IG51bWJlcjsgbTE1OiBudW1iZXI7IH1cbmA7XG5cbi8vIE5hbWVzIHRoYXQgc2hvdyB1cCBhdCB0aGUgdG9wIG9mIGV2ZXJ5IG5vZGUgZHVtcCBidXQgYXJlbid0XG4vLyB1c2VyLWZhY2luZyBwcm9wZXJ0aWVzOyBzdXBwcmVzcyBmcm9tIGdlbmVyYXRlZCBkZWZpbml0aW9ucy5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjb2RleCk6IGV4cGFuZGVkIGZyb20gdGhlIHYyLjQuMCBtaW5pbWFsIGxpc3QgdG9cbi8vIGNvdmVyIHByZWZhYi1pbnN0YW5jZS9zZXJpYWxpemF0aW9uIG1ldGFkYXRhIGFuZCBlZGl0b3Itb25seSBmaWVsZHNcbi8vIHRoYXQgQUkgc2hvdWxkbid0IHRyeSB0byBtdXRhdGUuXG4vL1xuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4K2NsYXVkZStnZW1pbmkpOiBDT01QT05FTlRfSU5URVJOQUxfS0VZUyB3YXNcbi8vIGtlcHQgaW4gdjIuNC4xIGluIGFudGljaXBhdGlvbiBvZiBhIHYyLjUrIGNvbXBvbmVudC1zaGFwZWQgcGF0aCwgYnV0XG4vLyByZW5kZXJUc0NsYXNzIGN1cnJlbnRseSBvbmx5IGV2ZXIgcnVucyBmb3Igbm9kZXMuIFJlbW92ZWQgZm9yIG5vdztcbi8vIHdoZW4gY29tcG9uZW50IHN1cHBvcnQgY29tZXMgYmFjaywgcmVzdG9yZSBmcm9tIGdpdCBoaXN0b3J5IHJhdGhlclxuLy8gdGhhbiBjYXJyeSBkZWFkIGNvZGUgdGhhdCBkcmlmdHMgb3V0IG9mIHN5bmMgd2l0aCBjb2NvcyBlZGl0b3IuXG5jb25zdCBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX2NvbXBzX18nLCAnX19wcmVmYWJfXycsICdfX2VkaXRvckV4dHJhc19fJyxcbiAgICAnX29iakZsYWdzJywgJ19pZCcsICd1dWlkJyxcbiAgICAnY2hpbGRyZW4nLCAncGFyZW50JyxcbiAgICAnX3ByZWZhYkluc3RhbmNlJywgJ19wcmVmYWInLCAnbW91bnRlZFJvb3QnLCAnbW91bnRlZENoaWxkcmVuJyxcbiAgICAncmVtb3ZlZENvbXBvbmVudHMnLCAnX2NvbXBvbmVudHMnLFxuXSk7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgY29jb3MgY29tbW9uIHR5cGVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gaGFyZGNvZGVkIFR5cGVTY3JpcHQgZGVjbGFyYXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBTaXplLCBRdWF0LCBNYXQzLzQpIGFuZCB0aGUgSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuIEFJIGNhbiBwcmVwZW5kIHRoaXMgdG8gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uIG91dHB1dCBiZWZvcmUgZ2VuZXJhdGluZyB0eXBlLXNhZmUgY29kZS4gTm8gc2NlbmUgcXVlcnkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldENvbW1vblR5cGVzRGVmaW5pdGlvbigpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHsgZGVmaW5pdGlvbjogQ09NTU9OX1RZUEVTX0RFRklOSVRJT04gfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfaW5zdGFuY2VfZGVmaW5pdGlvbicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBpbnN0YW5jZSBUUyBkZWZpbml0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGEgc2NlbmUgbm9kZSwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHNjZW5lL3F1ZXJ5LW5vZGUgZHVtcC4gVGhlIGdlbmVyYXRlZCBjbGFzcyBpbmNsdWRlcyBhIGNvbW1lbnQgbGlzdGluZyB0aGUgY29tcG9uZW50cyBhdHRhY2hlZCB0byB0aGUgbm9kZSAod2l0aCBVVUlEcykuIEFJIHNob3VsZCBjYWxsIHRoaXMgQkVGT1JFIHdyaXRpbmcgcHJvcGVydGllcyBzbyBpdCBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciB3aXRoIGdldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiBmb3IgVmVjMi9Db2xvci9ldGMgcmVmZXJlbmNlcy4gdjIuNC4xIG5vdGU6IG9ubHkgbm9kZS1zaGFwZWQgcmVmZXJlbmNlcyBhcmUgaW5zcGVjdGVkIGhlcmUg4oCUIGNvbXBvbmVudC9hc3NldCBkZWZpbml0aW9uIHN1cHBvcnQgaXMgZGVmZXJyZWQgdW50aWwgYSB2ZXJpZmllZCBDb2NvcyBxdWVyeS1jb21wb25lbnQgY2hhbm5lbCBpcyB3aXJlZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUuIHtpZH0gPSBub2RlIFVVSUQsIHt0eXBlfSBvcHRpb25hbCBjYyBjbGFzcyBsYWJlbC4gQ29tcG9uZW50IG9yIGFzc2V0IHJlZmVyZW5jZXMgd2lsbCByZXR1cm4gYW4gZXJyb3IgaW4gdjIuNC4xLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEluc3RhbmNlRGVmaW5pdGlvbihhcmdzOiB7IHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgcmVmZXJlbmNlIH0gPSBhcmdzO1xuICAgICAgICBpZiAoIXJlZmVyZW5jZT8uaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgcmVmZXJlbmNlLmlkKTtcbiAgICAgICAgICAgIGlmICghZHVtcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGluc3BlY3RvcjogcXVlcnktbm9kZSByZXR1cm5lZCBubyBkdW1wIGZvciAke3JlZmVyZW5jZS5pZH0uIElmIHRoaXMgaXMgYSBjb21wb25lbnQgb3IgYXNzZXQgVVVJRCwgdjIuNC4xIGRvZXMgbm90IHN1cHBvcnQgaXQ7IHBhc3MgdGhlIGhvc3Qgbm9kZSBVVUlEIGluc3RlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4KTogdHJ1c3QgdGhlIGR1bXAncyBfX3R5cGVfXywgbm90XG4gICAgICAgICAgICAvLyB0aGUgY2FsbGVyLXN1cHBsaWVkIHJlZmVyZW5jZS50eXBlLiBBIGNhbGxlciBwYXNzaW5nXG4gICAgICAgICAgICAvLyB7aWQ6IG5vZGVVdWlkLCB0eXBlOiAnY2MuU3ByaXRlJ30gb3RoZXJ3aXNlIGdvdCBhIG5vZGVcbiAgICAgICAgICAgIC8vIGR1bXAgcmVuZGVyZWQgYXMgYGNsYXNzIFNwcml0ZWAsIG1pc2xhYmVsbGluZyB0aGVcbiAgICAgICAgICAgIC8vIGRlY2xhcmF0aW9uIGVudGlyZWx5LiByZWZlcmVuY2UudHlwZSBpcyBub3cgZGlhZ25vc3RpY1xuICAgICAgICAgICAgLy8gb25seSDigJQgc3VyZmFjZWQgaW4gdGhlIHJlc3BvbnNlIGRhdGEgc28gY2FsbGVycyBjYW4gc2VlXG4gICAgICAgICAgICAvLyBhIG1pc21hdGNoIGJ1dCBuZXZlciB1c2VkIGFzIHRoZSBjbGFzcyBuYW1lLlxuICAgICAgICAgICAgY29uc3QgZHVtcFR5cGUgPSBTdHJpbmcoZHVtcC5fX3R5cGVfXyA/PyBkdW1wLnR5cGUgPz8gJ0NvY29zSW5zdGFuY2UnKTtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IGR1bXBUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZmVyZW5jZVR5cGVNaXNtYXRjaCA9IHJlZmVyZW5jZS50eXBlXG4gICAgICAgICAgICAgICAgJiYgcmVmZXJlbmNlLnR5cGUgIT09IGR1bXBUeXBlXG4gICAgICAgICAgICAgICAgJiYgcmVmZXJlbmNlLnR5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpICE9PSBjbGFzc05hbWU7XG4gICAgICAgICAgICBjb25zdCB0cyA9IHJlbmRlclRzQ2xhc3MoY2xhc3NOYW1lLCBkdW1wLCAvKiBpc0NvbXBvbmVudCAqLyBmYWxzZSk7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZTogVG9vbFJlc3BvbnNlID0ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IHsgaWQ6IHJlZmVyZW5jZS5pZCwgdHlwZTogZHVtcC5fX3R5cGVfXyA/PyByZWZlcmVuY2UudHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChyZWZlcmVuY2VUeXBlTWlzbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5nID0gYGluc3BlY3RvcjogcmVmZXJlbmNlLnR5cGUgKCR7cmVmZXJlbmNlLnR5cGV9KSBkb2VzIG5vdCBtYXRjaCBkdW1wIF9fdHlwZV9fICgke2R1bXBUeXBlfSk7IGNsYXNzIGxhYmVsIHVzZXMgdGhlIGR1bXAgdmFsdWVgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgaW5zcGVjdG9yOiBxdWVyeS1ub2RlIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIFJlbmRlciBhIHNpbmdsZSBjbGFzcyBkZWNsYXJhdGlvbi4gRm9yIG5vZGVzLCBhbHNvIGVudW1lcmF0ZVxuICogY29tcG9uZW50cyBmcm9tIGBfX2NvbXBzX19gIGFzIGEgY29tbWVudCBzbyBBSSBrbm93cyB3aGljaFxuICogc3ViLWluc3RhbmNlcyBleGlzdCAod2l0aG91dCBpbmxpbmluZyB0aGVpciBmdWxsIFRTIOKAlCB0aG9zZVxuICogcmVxdWlyZSBhIHNlcGFyYXRlIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIGNhbGwgYnkgY29tcG9uZW50XG4gKiBVVUlEKS5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZHVtcDogYW55LCBfaXNDb21wb25lbnQ6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgIC8vIHYyLjQuMjogX2lzQ29tcG9uZW50IGtlcHQgZm9yIGZvcndhcmQtY29tcGF0IHNpZ25hdHVyZSBzdGFiaWxpdHk7XG4gICAgLy8gY3VycmVudGx5IGFsd2F5cyBmYWxzZS4gdjIuNSsgd2lsbCByZWludHJvZHVjZSBhIGNvbXBvbmVudCBicmFuY2guXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgbGluZXMucHVzaChgY2xhc3MgJHtzYW5pdGl6ZVRzTmFtZShjbGFzc05hbWUpfSB7YCk7XG5cbiAgICBmb3IgKGNvbnN0IHByb3BOYW1lIG9mIE9iamVjdC5rZXlzKGR1bXApKSB7XG4gICAgICAgIGlmIChOT0RFX0RVTVBfSU5URVJOQUxfS0VZUy5oYXMocHJvcE5hbWUpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgcHJvcEVudHJ5ID0gZHVtcFtwcm9wTmFtZV07XG4gICAgICAgIGlmIChwcm9wRW50cnkgPT09IHVuZGVmaW5lZCB8fCBwcm9wRW50cnkgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAvLyBDb2NvcyBkdW1wIGVudHJpZXMgYXJlIHR5cGljYWxseSBge3R5cGUsIHZhbHVlLCB2aXNpYmxlPywgcmVhZG9ubHk/LCAuLi59YC5cbiAgICAgICAgLy8gU2tpcCBleHBsaWNpdGx5LWhpZGRlbiBpbnNwZWN0b3IgZmllbGRzOyB0aGV5J3JlIG5vdCB1c2VyLWZhY2luZy5cbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wRW50cnkgPT09ICdvYmplY3QnICYmIHByb3BFbnRyeS52aXNpYmxlID09PSBmYWxzZSkgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgdHNUeXBlID0gcmVzb2x2ZVRzVHlwZShwcm9wRW50cnkpO1xuICAgICAgICBjb25zdCByZWFkb25seSA9IHByb3BFbnRyeT8ucmVhZG9ubHkgPyAncmVhZG9ubHkgJyA6ICcnO1xuICAgICAgICBjb25zdCBlbnVtSGludCA9IGVudW1Db21tZW50SGludChwcm9wRW50cnkpO1xuICAgICAgICBjb25zdCB0b29sdGlwU3JjOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBwcm9wRW50cnk/LnRvb2x0aXA7XG4gICAgICAgIGlmICh0b29sdGlwU3JjICYmIHR5cGVvZiB0b29sdGlwU3JjID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8qKiAke3Nhbml0aXplRm9yQ29tbWVudCh0b29sdGlwU3JjKX0gKi9gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZW51bUhpbnQpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtlbnVtSGludH0gKi9gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzYWZlUHJvcE5hbWUgPSBpc1NhZmVUc0lkZW50aWZpZXIocHJvcE5hbWUpID8gcHJvcE5hbWUgOiBKU09OLnN0cmluZ2lmeShwcm9wTmFtZSk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAke3JlYWRvbmx5fSR7c2FmZVByb3BOYW1lfTogJHt0c1R5cGV9O2ApO1xuICAgIH1cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKSAmJiBkdW1wLl9fY29tcHNfXy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcgICAgLy8gQ29tcG9uZW50cyBvbiB0aGlzIG5vZGUgKGluc3BlY3QgZWFjaCBzZXBhcmF0ZWx5IHZpYSBnZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiB3aXRoIHRoZSBob3N0IG5vZGUgVVVJRCBmaXJzdDsgY29tcG9uZW50LXNwZWNpZmljIGR1bXAgYWNjZXNzIGlzIHYyLjUrKTonKTtcbiAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGR1bXAuX19jb21wc19fKSB7XG4gICAgICAgICAgICBjb25zdCBjVHlwZSA9IHNhbml0aXplRm9yQ29tbWVudChTdHJpbmcoY29tcD8uX190eXBlX18gPz8gY29tcD8udHlwZSA/PyAndW5rbm93bicpKTtcbiAgICAgICAgICAgIGNvbnN0IGNVdWlkID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy52YWx1ZT8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZCA/PyAnPycpKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvLyAtICR7Y1R5cGV9ICB1dWlkPSR7Y1V1aWR9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG4vLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogdG9vbHRpcHMgYW5kIGNvbXBvbmVudCBtZXRhZGF0YSBjYW5cbi8vIGNvbnRhaW4gYCovYCAoY2xvc2VzIHRoZSBkb2MgY29tbWVudCksIGBcXG5gIChicmVha3MgYSBgLy9gIGNvbW1lbnRcbi8vIGludG8gc3RyYXkgY29kZSksIG9yIGBcXHJgLiBTaW5nbGUtbGluZS1jb21tZW50IGNvbnRleHQgaXMgdGhlXG4vLyBkYW5nZXJvdXMgb25lLiBTdHJpcCBib3RoLlxuZnVuY3Rpb24gc2FuaXRpemVGb3JDb21tZW50KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRleHRcbiAgICAgICAgLnJlcGxhY2UoL1xcKlxcLy9nLCAnKlxcXFwvJylcbiAgICAgICAgLnJlcGxhY2UoL1xccj9cXG4vZywgJyAnKVxuICAgICAgICAucmVwbGFjZSgvXFxyL2csICcgJyk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB1bnNhbml0aXplZCBjdXN0b20tc2NyaXB0IGNsYXNzIG5hbWVzXG4vLyAoZS5nLiBgTXkuRm9vYCwgYE15LUZvb2ApIGVtaXR0ZWQgZGlyZWN0bHkgaW50byB0aGUgVFMgb3V0cHV0IHByb2R1Y2Vcbi8vIGludmFsaWQgVFMuIEpTT04tc3RyaW5naWZ5IGFueSBwcm9wZXJ0eSBuYW1lIHRoYXQgaXNuJ3QgYSBwbGFpbiBpZGVudC5cbmZ1bmN0aW9uIGlzU2FmZVRzSWRlbnRpZmllcihuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gL15bQS1aYS16XyRdW0EtWmEtejAtOV8kXSokLy50ZXN0KG5hbWUpO1xufVxuXG4vLyB2Mi40LjEgcmV2aWV3IGZpeCAoZ2VtaW5pKTogRW51bS9CaXRNYXNrIHdlcmUgZW1pdHRlZCBhcyBiYXJlXG4vLyBgbnVtYmVyYC4gU3VyZmFjZSB0aGUgZW51bSBjbGFzcyB2aWEgY29tbWVudCBzbyBBSSBjYW4gbG9vayBpdCB1cFxuLy8gcmF0aGVyIHRoYW4gZ3Vlc3MuXG5mdW5jdGlvbiBlbnVtQ29tbWVudEhpbnQoZW50cnk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgdDogc3RyaW5nID0gZW50cnkudHlwZSA/PyAnJztcbiAgICBpZiAodCAhPT0gJ0VudW0nICYmIHQgIT09ICdCaXRNYXNrJykgcmV0dXJuIG51bGw7XG4gICAgLy8gdjIuNC4yIHJldmlldyBmaXggKGNsYXVkZSk6IHRoZSB2Mi40LjEgZmFsbGJhY2sgaW5jbHVkZWRcbiAgICAvLyBgdXNlckRhdGEuZW51bUxpc3RbMF0ubmFtZWAgd2hpY2ggaXMgdGhlICpmaXJzdCBlbnVtIHZhbHVlJ3MqXG4gICAgLy8gbmFtZSwgbm90IHRoZSBlbnVtIGNsYXNzIG5hbWUg4oCUIHByb2R1Y2VkIG1pc2xlYWRpbmcgY29tbWVudHMuXG4gICAgLy8gRHJvcCB0aGF0IHBhdGg7IG9ubHkgdXNlIGV4cGxpY2l0IGVudW1OYW1lIGZpZWxkcy5cbiAgICBjb25zdCBlbnVtTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gZW50cnk/LnVzZXJEYXRhPy5lbnVtTmFtZVxuICAgICAgICA/PyBlbnRyeT8uZW51bU5hbWU7XG4gICAgLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4KTogY29jb3Mgc29tZXRpbWVzIG5lc3RzIGVudW1MaXN0IC9cbiAgICAvLyBiaXRtYXNrTGlzdCB1bmRlciB1c2VyRGF0YSwgc29tZXRpbWVzIGF0IHRoZSB0b3AgbGV2ZWwuIENoZWNrXG4gICAgLy8gYm90aCBiZWZvcmUgZ2l2aW5nIHVwLlxuICAgIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KGVudHJ5LmVudW1MaXN0KSA/IGVudHJ5LmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeS5iaXRtYXNrTGlzdCkgPyBlbnRyeS5iaXRtYXNrTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5lbnVtTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5iaXRtYXNrTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5iaXRtYXNrTGlzdFxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3Qgc2FtcGxlID0gbGlzdCAmJiBsaXN0Lmxlbmd0aCA+IDBcbiAgICAgICAgPyBsaXN0LnNsaWNlKDAsIDgpLm1hcCgoaXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbiA9IGl0Py5uYW1lID8/ICc/JztcbiAgICAgICAgICAgIGNvbnN0IHYgPSBpdD8udmFsdWUgPz8gJz8nO1xuICAgICAgICAgICAgcmV0dXJuIGAke259PSR7dn1gO1xuICAgICAgICB9KS5qb2luKCcsICcpXG4gICAgICAgIDogbnVsbDtcbiAgICBpZiAoZW51bU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHNhbml0aXplRm9yQ29tbWVudChgJHt0fTogJHtlbnVtTmFtZX0ke3NhbXBsZSA/IGAg4oCUICR7c2FtcGxlfWAgOiAnJ31gKTtcbiAgICB9XG4gICAgaWYgKHNhbXBsZSkge1xuICAgICAgICByZXR1cm4gc2FuaXRpemVGb3JDb21tZW50KGAke3R9IHZhbHVlczogJHtzYW1wbGV9YCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNUeXBlKGVudHJ5OiBhbnkpOiBzdHJpbmcge1xuICAgIGlmIChlbnRyeSA9PT0gdW5kZWZpbmVkIHx8IGVudHJ5ID09PSBudWxsKSByZXR1cm4gJ3Vua25vd24nO1xuICAgIC8vIFBsYWluIHByaW1pdGl2ZXMgcGFzc2VkIHRocm91Z2ggZGlyZWN0bHkgKHJhcmUgaW4gZHVtcCBzaGFwZSkuXG4gICAgY29uc3QgdHQgPSB0eXBlb2YgZW50cnk7XG4gICAgaWYgKHR0ID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0dCA9PT0gJ251bWJlcicpIHJldHVybiAnbnVtYmVyJztcbiAgICBpZiAodHQgPT09ICdib29sZWFuJykgcmV0dXJuICdib29sZWFuJztcblxuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnkuaXNBcnJheTtcblxuICAgIGxldCB0czogc3RyaW5nO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdTdHJpbmcnOiB0cyA9ICdzdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IHRzID0gJ2Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzInOiB0cyA9ICdWZWMyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzMnOiB0cyA9ICdWZWMzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzQnOiB0cyA9ICdWZWM0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLkNvbG9yJzogdHMgPSAnQ29sb3InOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUmVjdCc6IHRzID0gJ1JlY3QnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuU2l6ZSc6IHRzID0gJ1NpemUnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUXVhdCc6IHRzID0gJ1F1YXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0Myc6IHRzID0gJ01hdDMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0NCc6IHRzID0gJ01hdDQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJzogdHMgPSAndW5rbm93bic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogc2FuaXRpemUgY3VzdG9tIGNsYXNzIG5hbWVzXG4gICAgICAgICAgICAvLyBiZWZvcmUgcGFzdGluZyB0aGVtIGludG8gdGhlIFRTIG91dHB1dC4gYE15LkZvb2AgZXRjLlxuICAgICAgICAgICAgLy8gd291bGQgYmUgaW52YWxpZCBUUyBvdGhlcndpc2UuXG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZFR5cGUgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSkgfHwgJ3Vua25vd24nO1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ0NvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICB0cyA9IGlzUmVmZXJlbmNlID8gYEluc3RhbmNlUmVmZXJlbmNlPCR7c3RyaXBwZWRUeXBlfT5gIDogc3RyaXBwZWRUeXBlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBpc0FycmF5ID8gYEFycmF5PCR7dHN9PmAgOiB0cztcbn1cblxuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4KTogdGhlIHYyLjQuMSBpbXBsZW1lbnRhdGlvbiBvbmx5IHN0cmlwcGVkXG4vLyBub24taWRlbnRpZmllciBjaGFyYWN0ZXJzIGJ1dCBkaWRuJ3QgZ3VhcmQgYWdhaW5zdCBhIGRpZ2l0LWxlYWRpbmdcbi8vIHJlc3VsdCAoYGNsYXNzIDJkU3ByaXRlYCkgb3IgYW4gZW1wdHkgcmVzdWx0IChhZnRlciBzdHJpcHBpbmcgYWxsXG4vLyBjaGFycyBpbiBhIFVVSUQtc2hhcGVkIF9fdHlwZV9fKS4gQm90aCBwcm9kdWNlIGludmFsaWQgVFMuIFByZWZpeFxuLy8gZGlnaXQtbGVhZGluZyBhbmQgZW1wdHkgY2FzZXMgd2l0aCBgX2AgLyBgX1Vua25vd25gLlxuZnVuY3Rpb24gc2FuaXRpemVUc05hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBjbGVhbmVkID0gU3RyaW5nKG5hbWUgPz8gJycpLnJlcGxhY2UoL1teYS16QS1aMC05X10vZywgJ18nKTtcbiAgICBpZiAoY2xlYW5lZC5sZW5ndGggPT09IDApIHJldHVybiAnX1Vua25vd24nO1xuICAgIGlmICgvXlswLTldLy50ZXN0KGNsZWFuZWQpKSByZXR1cm4gYF8ke2NsZWFuZWR9YDtcbiAgICByZXR1cm4gY2xlYW5lZDtcbn1cbiJdfQ==