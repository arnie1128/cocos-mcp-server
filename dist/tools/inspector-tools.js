"use strict";
/**
 * inspector-tools — TypeScript class-definition generator backed by
 * cocos `scene/query-node` dumps.
 *
 * Two MCP tools:
 *   - inspector_get_instance_definition  — for a **node** or
 *     component reference, walk the cocos dump and emit a TypeScript
 *     class declaration AI can read before changing properties. Avoids
 *     the "AI guesses property name" failure mode.
 *   - inspector_get_common_types_definition — return hardcoded
 *     definitions for cocos value types (Vec2/3/4, Color, Rect, etc.)
 *     that the instance definition references but doesn't inline.
 *
 * Reference: cocos-code-mode (RomaRogov)
 * `D:/1_dev/cocos-mcp-references/cocos-code-mode/source/utcp/tools/typescript-defenition.ts`.
 * Our impl walks property dumps, decorators, enum/BitMask metadata,
 * nested structs, arrays, and references.
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
// removed after drifting out of sync with cocos editor. The shared
// renderer keeps this conservative node metadata filter for both node
// and component-shaped dumps.
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
                return { success: false, error: `inspector: query-node returned no dump for ${reference.id}.` };
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
            const ts = renderTsClass(className, dump, isComponentDump(dump));
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
        description: 'Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: schema_1.z.object({}),
    })
], InspectorTools.prototype, "getCommonTypesDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_instance_definition',
        title: 'Read instance TS definition',
        description: 'Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.describe('Target node or component. {id} = instance UUID, {type} optional cc class label.'),
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
    const ctx = { definitions: [], definedNames: new Set() };
    processTsClass(ctx, className, dump, isComponent);
    return ctx.definitions.join('\n\n');
}
function processTsClass(ctx, className, dump, isComponent) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const safeClassName = sanitizeTsName(String(className !== null && className !== void 0 ? className : '').replace(/^cc\./, ''));
    if (ctx.definedNames.has(safeClassName))
        return;
    ctx.definedNames.add(safeClassName);
    const lines = [];
    lines.push(`class ${safeClassName}${isComponent ? ' extends Component' : ''} {`);
    if (dump && typeof dump === 'object') {
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
            const resolved = resolveTsPropertyType(ctx, safeClassName, propName, propEntry);
            const readonly = (propEntry === null || propEntry === void 0 ? void 0 : propEntry.readonly) ? 'readonly ' : '';
            const tooltipSrc = propEntry === null || propEntry === void 0 ? void 0 : propEntry.tooltip;
            if (tooltipSrc && typeof tooltipSrc === 'string') {
                lines.push(`    /** ${sanitizeForComment(tooltipSrc)} */`);
            }
            const decorator = renderPropertyDecorator(propEntry, resolved.decoratorType);
            if (decorator) {
                lines.push(`    ${decorator}`);
            }
            const safePropName = isSafeTsIdentifier(propName) ? propName : JSON.stringify(propName);
            lines.push(`    ${readonly}${safePropName}: ${resolved.tsType};`);
        }
    }
    if (!isComponent && Array.isArray(dump === null || dump === void 0 ? void 0 : dump.__comps__) && dump.__comps__.length > 0) {
        lines.push('');
        lines.push('    // Components on this node (inspect each separately via get_instance_definition with the host node UUID first):');
        for (const comp of dump.__comps__) {
            const cType = sanitizeForComment(String((_b = (_a = comp === null || comp === void 0 ? void 0 : comp.__type__) !== null && _a !== void 0 ? _a : comp === null || comp === void 0 ? void 0 : comp.type) !== null && _b !== void 0 ? _b : 'unknown'));
            const cUuid = sanitizeForComment(String((_h = (_g = (_e = (_d = (_c = comp === null || comp === void 0 ? void 0 : comp.value) === null || _c === void 0 ? void 0 : _c.uuid) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : (_f = comp === null || comp === void 0 ? void 0 : comp.uuid) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : comp === null || comp === void 0 ? void 0 : comp.uuid) !== null && _h !== void 0 ? _h : '?'));
            lines.push(`    // - ${cType}  uuid=${cUuid}`);
        }
    }
    lines.push('}');
    ctx.definitions.push(lines.join('\n'));
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
function resolveTsPropertyType(ctx, ownerClassName, propName, entry) {
    var _a;
    const isArray = !!(entry === null || entry === void 0 ? void 0 : entry.isArray);
    const itemEntry = isArray ? arrayItemEntry(entry) : entry;
    const enumList = (_a = enumOrBitmaskList(itemEntry)) !== null && _a !== void 0 ? _a : enumOrBitmaskList(entry);
    if (enumList) {
        const enumName = pascalCaseName(propName);
        generateConstEnumDefinition(ctx, enumName, enumList);
        return {
            tsType: isArray ? `Array<${enumName}>` : enumName,
            decoratorType: isArray ? `[${enumName}]` : enumName,
        };
    }
    const structValue = nestedStructValue(itemEntry);
    if (structValue && !isCommonValueType(itemEntry === null || itemEntry === void 0 ? void 0 : itemEntry.type) && !isReferenceEntry(itemEntry)) {
        const structName = nestedStructClassName(ownerClassName, propName, structValue, isArray);
        processTsClass(ctx, structName, structValue, false);
        return {
            tsType: isArray ? `Array<${structName}>` : structName,
            decoratorType: isArray ? `[${structName}]` : structName,
        };
    }
    const tsType = resolveTsType(itemEntry);
    return { tsType: isArray ? `Array<${tsType}>` : tsType };
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
    return ts;
}
function renderPropertyDecorator(entry, resolvedType) {
    if (!entry || typeof entry !== 'object')
        return null;
    const parts = [];
    const typeExpr = resolvedType !== null && resolvedType !== void 0 ? resolvedType : decoratorTypeExpression(entry);
    const hasEnumOrBitmaskList = enumOrBitmaskList(entry) !== null
        || enumOrBitmaskList(arrayItemEntry(entry)) !== null;
    if ((entry.type !== undefined || hasEnumOrBitmaskList) && typeExpr) {
        parts.push(`type: ${typeExpr}`);
    }
    for (const attr of ['min', 'max', 'step', 'unit', 'radian', 'multiline', 'tooltip']) {
        const value = entry[attr];
        if (value !== undefined && value !== null) {
            parts.push(`${attr}: ${decoratorValue(value)}`);
        }
    }
    if (parts.length === 0)
        return null;
    return `@property({ ${parts.join(', ')} })`;
}
function decoratorTypeExpression(entry) {
    const isArray = !!(entry === null || entry === void 0 ? void 0 : entry.isArray);
    const itemEntry = isArray ? arrayItemEntry(entry) : entry;
    const rawType = itemEntry === null || itemEntry === void 0 ? void 0 : itemEntry.type;
    if (!rawType)
        return null;
    let expr;
    switch (rawType) {
        case 'Integer':
            expr = 'CCInteger';
            break;
        case 'Float':
        case 'Number':
            expr = 'CCFloat';
            break;
        case 'String':
            expr = 'String';
            break;
        case 'Boolean':
            expr = 'Boolean';
            break;
        case 'Enum':
        case 'BitMask':
            expr = 'Number';
            break;
        default: expr = sanitizeTsName(rawType.replace(/^cc\./, ''));
    }
    if (!expr)
        return null;
    return isArray ? `[${expr}]` : expr;
}
function decoratorValue(value) {
    if (typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return JSON.stringify(value);
}
function arrayItemEntry(entry) {
    if (entry === null || entry === void 0 ? void 0 : entry.elementTypeData)
        return entry.elementTypeData;
    if (Array.isArray(entry === null || entry === void 0 ? void 0 : entry.value) && entry.value.length > 0)
        return entry.value[0];
    return entry;
}
function enumOrBitmaskList(entry) {
    var _a, _b;
    if (!entry || typeof entry !== 'object')
        return null;
    return Array.isArray(entry.enumList) ? entry.enumList
        : Array.isArray(entry.bitmaskList) ? entry.bitmaskList
            : Array.isArray((_a = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _a === void 0 ? void 0 : _a.enumList) ? entry.userData.enumList
                : Array.isArray((_b = entry === null || entry === void 0 ? void 0 : entry.userData) === null || _b === void 0 ? void 0 : _b.bitmaskList) ? entry.userData.bitmaskList
                    : null;
}
function generateConstEnumDefinition(ctx, enumName, items) {
    const safeEnumName = sanitizeTsName(enumName);
    if (ctx.definedNames.has(safeEnumName))
        return;
    ctx.definedNames.add(safeEnumName);
    const usedMemberNames = new Set();
    const lines = [`const enum ${safeEnumName} {`];
    items.forEach((item, index) => {
        var _a, _b, _c;
        const rawName = (_c = (_b = (_a = item === null || item === void 0 ? void 0 : item.name) !== null && _a !== void 0 ? _a : item === null || item === void 0 ? void 0 : item.displayName) !== null && _b !== void 0 ? _b : item === null || item === void 0 ? void 0 : item.value) !== null && _c !== void 0 ? _c : `Value${index}`;
        let memberName = sanitizeTsName(String(rawName));
        if (usedMemberNames.has(memberName)) {
            memberName = `${memberName}_${index}`;
        }
        usedMemberNames.add(memberName);
        const value = item === null || item === void 0 ? void 0 : item.value;
        const initializer = typeof value === 'string'
            ? JSON.stringify(value)
            : typeof value === 'number'
                ? String(value)
                : String(index);
        lines.push(`    ${memberName} = ${initializer},`);
    });
    lines.push('}');
    ctx.definitions.push(lines.join('\n'));
}
function nestedStructValue(entry) {
    if (!entry || typeof entry !== 'object')
        return null;
    const value = entry.value;
    if (value && typeof value === 'object' && !Array.isArray(value) && '__type__' in value) {
        return value;
    }
    if ('__type__' in entry && !('type' in entry)) {
        return entry;
    }
    return null;
}
function nestedStructClassName(ownerClassName, propName, value, isArray) {
    var _a;
    const typeName = sanitizeTsName(String((_a = value === null || value === void 0 ? void 0 : value.__type__) !== null && _a !== void 0 ? _a : '').replace(/^cc\./, ''));
    if (typeName && typeName !== '_Unknown' && typeName !== 'Object') {
        return typeName;
    }
    return sanitizeTsName(`${ownerClassName}${pascalCaseName(propName)}${isArray ? 'Item' : 'Type'}`);
}
function isCommonValueType(type) {
    return type === 'cc.Vec2'
        || type === 'cc.Vec3'
        || type === 'cc.Vec4'
        || type === 'cc.Color'
        || type === 'cc.Rect'
        || type === 'cc.Size'
        || type === 'cc.Quat'
        || type === 'cc.Mat3'
        || type === 'cc.Mat4';
}
function isReferenceEntry(entry) {
    var _a, _b;
    if (!entry || typeof entry !== 'object')
        return false;
    const rawType = (_b = (_a = entry.type) !== null && _a !== void 0 ? _a : entry.__type__) !== null && _b !== void 0 ? _b : '';
    const extendsList = Array.isArray(entry.extends) ? entry.extends : [];
    return extendsList.includes('cc.Object')
        || rawType === 'Node'
        || rawType === 'Component'
        || rawType === 'cc.Node'
        || rawType === 'cc.Component'
        || (rawType.startsWith('cc.') && !isCommonValueType(rawType));
}
function pascalCaseName(name) {
    const words = String(name !== null && name !== void 0 ? name : '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
    return sanitizeTsName(pascal || name || 'Value');
}
function isComponentDump(dump) {
    var _a, _b;
    if (!dump || typeof dump !== 'object')
        return false;
    const rawType = String((_b = (_a = dump.__type__) !== null && _a !== void 0 ? _a : dump.type) !== null && _b !== void 0 ? _b : '');
    if (rawType === 'Node' || rawType === 'cc.Node')
        return false;
    const extendsList = Array.isArray(dump.extends) ? dump.extends : [];
    return extendsList.includes('cc.Component') || !Array.isArray(dump.__comps__);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7Ozs7Ozs7OztBQUdILDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBRXZGLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsbUVBQW1FO0FBQ25FLHNFQUFzRTtBQUN0RSw4QkFBOEI7QUFDOUIsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUNwQyxVQUFVLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxrQkFBa0I7SUFDekQsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNO0lBQzFCLFVBQVUsRUFBRSxRQUFRO0lBQ3BCLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsaUJBQWlCO0lBQzlELG1CQUFtQixFQUFFLGFBQWE7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsTUFBYSxjQUFjO0lBR3ZCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFRbkcsQUFBTixLQUFLLENBQUMsd0JBQXdCO1FBQzFCLE9B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TyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzlFLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRCxxRUFBcUU7QUFDckUscUVBQXFFO0FBQ3JFLG9FQUFvRTtBQUNwRSxvRUFBb0U7QUFDcEUsdURBQXVEO0FBQ3ZELFNBQVMsY0FBYyxDQUFDLElBQVk7SUFDaEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksYUFBSixJQUFJLGNBQUosSUFBSSxHQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNsRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sVUFBVSxDQUFDO0lBQzVDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7UUFBRSxPQUFPLElBQUksT0FBTyxFQUFFLENBQUM7SUFDakQsT0FBTyxPQUFPLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogaW5zcGVjdG9yLXRvb2xzIOKAlCBUeXBlU2NyaXB0IGNsYXNzLWRlZmluaXRpb24gZ2VuZXJhdG9yIGJhY2tlZCBieVxuICogY29jb3MgYHNjZW5lL3F1ZXJ5LW5vZGVgIGR1bXBzLlxuICpcbiAqIFR3byBNQ1AgdG9vbHM6XG4gKiAgIC0gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uICDigJQgZm9yIGEgKipub2RlKiogb3JcbiAqICAgICBjb21wb25lbnQgcmVmZXJlbmNlLCB3YWxrIHRoZSBjb2NvcyBkdW1wIGFuZCBlbWl0IGEgVHlwZVNjcmlwdFxuICogICAgIGNsYXNzIGRlY2xhcmF0aW9uIEFJIGNhbiByZWFkIGJlZm9yZSBjaGFuZ2luZyBwcm9wZXJ0aWVzLiBBdm9pZHNcbiAqICAgICB0aGUgXCJBSSBndWVzc2VzIHByb3BlcnR5IG5hbWVcIiBmYWlsdXJlIG1vZGUuXG4gKiAgIC0gaW5zcGVjdG9yX2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiDigJQgcmV0dXJuIGhhcmRjb2RlZFxuICogICAgIGRlZmluaXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBldGMuKVxuICogICAgIHRoYXQgdGhlIGluc3RhbmNlIGRlZmluaXRpb24gcmVmZXJlbmNlcyBidXQgZG9lc24ndCBpbmxpbmUuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdilcbiAqIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGUvc291cmNlL3V0Y3AvdG9vbHMvdHlwZXNjcmlwdC1kZWZlbml0aW9uLnRzYC5cbiAqIE91ciBpbXBsIHdhbGtzIHByb3BlcnR5IGR1bXBzLCBkZWNvcmF0b3JzLCBlbnVtL0JpdE1hc2sgbWV0YWRhdGEsXG4gKiBuZXN0ZWQgc3RydWN0cywgYXJyYXlzLCBhbmQgcmVmZXJlbmNlcy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIEBtY3BUb29sIGRlY29yYXRvciAodjIuNC4wIHN0ZXAgNSkuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuXG5jb25zdCBDT01NT05fVFlQRVNfREVGSU5JVElPTiA9IGAvLyBDb2NvcyBjb21tb24gdmFsdWUgdHlwZXMg4oCUIHJlZmVyZW5jZWQgYnkgaW5zdGFuY2UgZGVmaW5pdGlvbnMuXG50eXBlIEluc3RhbmNlUmVmZXJlbmNlPFQgPSB1bmtub3duPiA9IHsgaWQ6IHN0cmluZzsgdHlwZT86IHN0cmluZyB9O1xuY2xhc3MgVmVjMiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB9XG5jbGFzcyBWZWMzIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfVxuY2xhc3MgVmVjNCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgQ29sb3IgeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXI7IH1cbmNsYXNzIFJlY3QgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFNpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgUXVhdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgTWF0MyB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7XG4gIG0wMzogbnVtYmVyOyBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7XG4gIG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjsgbTA4OiBudW1iZXI7IH1cbmNsYXNzIE1hdDQgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyOyBtMDM6IG51bWJlcjtcbiAgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyOyBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7XG4gIG0wODogbnVtYmVyOyBtMDk6IG51bWJlcjsgbTEwOiBudW1iZXI7IG0xMTogbnVtYmVyO1xuICBtMTI6IG51bWJlcjsgbTEzOiBudW1iZXI7IG0xNDogbnVtYmVyOyBtMTU6IG51bWJlcjsgfVxuYDtcblxuLy8gTmFtZXMgdGhhdCBzaG93IHVwIGF0IHRoZSB0b3Agb2YgZXZlcnkgbm9kZSBkdW1wIGJ1dCBhcmVuJ3Rcbi8vIHVzZXItZmFjaW5nIHByb3BlcnRpZXM7IHN1cHByZXNzIGZyb20gZ2VuZXJhdGVkIGRlZmluaXRpb25zLlxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNvZGV4KTogZXhwYW5kZWQgZnJvbSB0aGUgdjIuNC4wIG1pbmltYWwgbGlzdCB0b1xuLy8gY292ZXIgcHJlZmFiLWluc3RhbmNlL3NlcmlhbGl6YXRpb24gbWV0YWRhdGEgYW5kIGVkaXRvci1vbmx5IGZpZWxkc1xuLy8gdGhhdCBBSSBzaG91bGRuJ3QgdHJ5IHRvIG11dGF0ZS5cbi8vXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgrY2xhdWRlK2dlbWluaSk6IENPTVBPTkVOVF9JTlRFUk5BTF9LRVlTIHdhc1xuLy8gcmVtb3ZlZCBhZnRlciBkcmlmdGluZyBvdXQgb2Ygc3luYyB3aXRoIGNvY29zIGVkaXRvci4gVGhlIHNoYXJlZFxuLy8gcmVuZGVyZXIga2VlcHMgdGhpcyBjb25zZXJ2YXRpdmUgbm9kZSBtZXRhZGF0YSBmaWx0ZXIgZm9yIGJvdGggbm9kZVxuLy8gYW5kIGNvbXBvbmVudC1zaGFwZWQgZHVtcHMuXG5jb25zdCBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX2NvbXBzX18nLCAnX19wcmVmYWJfXycsICdfX2VkaXRvckV4dHJhc19fJyxcbiAgICAnX29iakZsYWdzJywgJ19pZCcsICd1dWlkJyxcbiAgICAnY2hpbGRyZW4nLCAncGFyZW50JyxcbiAgICAnX3ByZWZhYkluc3RhbmNlJywgJ19wcmVmYWInLCAnbW91bnRlZFJvb3QnLCAnbW91bnRlZENoaWxkcmVuJyxcbiAgICAncmVtb3ZlZENvbXBvbmVudHMnLCAnX2NvbXBvbmVudHMnLFxuXSk7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgY29jb3MgY29tbW9uIHR5cGVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gaGFyZGNvZGVkIFR5cGVTY3JpcHQgZGVjbGFyYXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBTaXplLCBRdWF0LCBNYXQzLzQpIGFuZCB0aGUgSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuIEFJIGNhbiBwcmVwZW5kIHRoaXMgdG8gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uIG91dHB1dCBiZWZvcmUgZ2VuZXJhdGluZyB0eXBlLXNhZmUgY29kZS4gTm8gc2NlbmUgcXVlcnkuIFN1cHBvcnRzIGJvdGggbm9kZSBhbmQgY29tcG9uZW50IGluc3RhbmNlIGR1bXBzIGluY2x1ZGluZyBAcHJvcGVydHkgZGVjb3JhdG9ycyBhbmQgZW51bSB0eXBlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Q29tbW9uVHlwZXNEZWZpbml0aW9uKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YTogeyBkZWZpbml0aW9uOiBDT01NT05fVFlQRVNfREVGSU5JVElPTiB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9pbnN0YW5jZV9kZWZpbml0aW9uJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGluc3RhbmNlIFRTIGRlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBmb3IgYSBzY2VuZSBub2RlLCBkZXJpdmVkIGZyb20gdGhlIGxpdmUgY29jb3Mgc2NlbmUvcXVlcnktbm9kZSBkdW1wLiBUaGUgZ2VuZXJhdGVkIGNsYXNzIGluY2x1ZGVzIGEgY29tbWVudCBsaXN0aW5nIHRoZSBjb21wb25lbnRzIGF0dGFjaGVkIHRvIHRoZSBub2RlICh3aXRoIFVVSURzKS4gQUkgc2hvdWxkIGNhbGwgdGhpcyBCRUZPUkUgd3JpdGluZyBwcm9wZXJ0aWVzIHNvIGl0IHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIHdpdGggZ2V0X2NvbW1vbl90eXBlc19kZWZpbml0aW9uIGZvciBWZWMyL0NvbG9yL2V0YyByZWZlcmVuY2VzLiBTdXBwb3J0cyBib3RoIG5vZGUgYW5kIGNvbXBvbmVudCBpbnN0YW5jZSBkdW1wcyBpbmNsdWRpbmcgQHByb3BlcnR5IGRlY29yYXRvcnMgYW5kIGVudW0gdHlwZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEuZGVzY3JpYmUoJ1RhcmdldCBub2RlIG9yIGNvbXBvbmVudC4ge2lkfSA9IGluc3RhbmNlIFVVSUQsIHt0eXBlfSBvcHRpb25hbCBjYyBjbGFzcyBsYWJlbC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRJbnN0YW5jZURlZmluaXRpb24oYXJnczogeyByZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB7IHJlZmVyZW5jZSB9ID0gYXJncztcbiAgICAgICAgaWYgKCFyZWZlcmVuY2U/LmlkKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdpbnNwZWN0b3JfZ2V0X2luc3RhbmNlX2RlZmluaXRpb246IHJlZmVyZW5jZS5pZCBpcyByZXF1aXJlZCcgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZHVtcDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHJlZmVyZW5jZS5pZCk7XG4gICAgICAgICAgICBpZiAoIWR1bXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBpbnNwZWN0b3I6IHF1ZXJ5LW5vZGUgcmV0dXJuZWQgbm8gZHVtcCBmb3IgJHtyZWZlcmVuY2UuaWR9LmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjQuMiByZXZpZXcgZml4IChjb2RleCk6IHRydXN0IHRoZSBkdW1wJ3MgX190eXBlX18sIG5vdFxuICAgICAgICAgICAgLy8gdGhlIGNhbGxlci1zdXBwbGllZCByZWZlcmVuY2UudHlwZS4gQSBjYWxsZXIgcGFzc2luZ1xuICAgICAgICAgICAgLy8ge2lkOiBub2RlVXVpZCwgdHlwZTogJ2NjLlNwcml0ZSd9IG90aGVyd2lzZSBnb3QgYSBub2RlXG4gICAgICAgICAgICAvLyBkdW1wIHJlbmRlcmVkIGFzIGBjbGFzcyBTcHJpdGVgLCBtaXNsYWJlbGxpbmcgdGhlXG4gICAgICAgICAgICAvLyBkZWNsYXJhdGlvbiBlbnRpcmVseS4gcmVmZXJlbmNlLnR5cGUgaXMgbm93IGRpYWdub3N0aWNcbiAgICAgICAgICAgIC8vIG9ubHkg4oCUIHN1cmZhY2VkIGluIHRoZSByZXNwb25zZSBkYXRhIHNvIGNhbGxlcnMgY2FuIHNlZVxuICAgICAgICAgICAgLy8gYSBtaXNtYXRjaCBidXQgbmV2ZXIgdXNlZCBhcyB0aGUgY2xhc3MgbmFtZS5cbiAgICAgICAgICAgIGNvbnN0IGR1bXBUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICdDb2Nvc0luc3RhbmNlJyk7XG4gICAgICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBkdW1wVHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJyk7XG4gICAgICAgICAgICBjb25zdCByZWZlcmVuY2VUeXBlTWlzbWF0Y2ggPSByZWZlcmVuY2UudHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlICE9PSBkdW1wVHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSAhPT0gY2xhc3NOYW1lO1xuICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZSwgZHVtcCwgaXNDb21wb25lbnREdW1wKGR1bXApKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiBkdW1wLl9fdHlwZV9fID8/IHJlZmVyZW5jZS50eXBlIH0sXG4gICAgICAgICAgICAgICAgICAgIGRlZmluaXRpb246IHRzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJlZmVyZW5jZVR5cGVNaXNtYXRjaCkge1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLndhcm5pbmcgPSBgaW5zcGVjdG9yOiByZWZlcmVuY2UudHlwZSAoJHtyZWZlcmVuY2UudHlwZX0pIGRvZXMgbm90IG1hdGNoIGR1bXAgX190eXBlX18gKCR7ZHVtcFR5cGV9KTsgY2xhc3MgbGFiZWwgdXNlcyB0aGUgZHVtcCB2YWx1ZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBpbnNwZWN0b3I6IHF1ZXJ5LW5vZGUgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgY2xhc3NOYW1lLCBkdW1wLCBpc0NvbXBvbmVudCk7XG4gICAgcmV0dXJuIGN0eC5kZWZpbml0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuaW50ZXJmYWNlIFJlbmRlckNvbnRleHQge1xuICAgIGRlZmluaXRpb25zOiBzdHJpbmdbXTtcbiAgICBkZWZpbmVkTmFtZXM6IFNldDxzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRQcm9wZXJ0eVR5cGUge1xuICAgIHRzVHlwZTogc3RyaW5nO1xuICAgIGRlY29yYXRvclR5cGU/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NUc0NsYXNzKGN0eDogUmVuZGVyQ29udGV4dCwgY2xhc3NOYW1lOiBzdHJpbmcsIGR1bXA6IGFueSwgaXNDb21wb25lbnQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBjb25zdCBzYWZlQ2xhc3NOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKGNsYXNzTmFtZSA/PyAnJykucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbiAgICBpZiAoY3R4LmRlZmluZWROYW1lcy5oYXMoc2FmZUNsYXNzTmFtZSkpIHJldHVybjtcbiAgICBjdHguZGVmaW5lZE5hbWVzLmFkZChzYWZlQ2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxpbmVzLnB1c2goYGNsYXNzICR7c2FmZUNsYXNzTmFtZX0ke2lzQ29tcG9uZW50ID8gJyBleHRlbmRzIENvbXBvbmVudCcgOiAnJ30ge2ApO1xuXG4gICAgaWYgKGR1bXAgJiYgdHlwZW9mIGR1bXAgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGZvciAoY29uc3QgcHJvcE5hbWUgb2YgT2JqZWN0LmtleXMoZHVtcCkpIHtcbiAgICAgICAgICAgIGlmIChOT0RFX0RVTVBfSU5URVJOQUxfS0VZUy5oYXMocHJvcE5hbWUpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHByb3BFbnRyeSA9IGR1bXBbcHJvcE5hbWVdO1xuICAgICAgICAgICAgaWYgKHByb3BFbnRyeSA9PT0gdW5kZWZpbmVkIHx8IHByb3BFbnRyeSA9PT0gbnVsbCkgY29udGludWU7XG4gICAgICAgICAgICAvLyBDb2NvcyBkdW1wIGVudHJpZXMgYXJlIHR5cGljYWxseSBge3R5cGUsIHZhbHVlLCB2aXNpYmxlPywgcmVhZG9ubHk/LCAuLi59YC5cbiAgICAgICAgICAgIC8vIFNraXAgZXhwbGljaXRseS1oaWRkZW4gaW5zcGVjdG9yIGZpZWxkczsgdGhleSdyZSBub3QgdXNlci1mYWNpbmcuXG4gICAgICAgICAgICBpZiAodHlwZW9mIHByb3BFbnRyeSA9PT0gJ29iamVjdCcgJiYgcHJvcEVudHJ5LnZpc2libGUgPT09IGZhbHNlKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVHNQcm9wZXJ0eVR5cGUoY3R4LCBzYWZlQ2xhc3NOYW1lLCBwcm9wTmFtZSwgcHJvcEVudHJ5KTtcbiAgICAgICAgICAgIGNvbnN0IHJlYWRvbmx5ID0gcHJvcEVudHJ5Py5yZWFkb25seSA/ICdyZWFkb25seSAnIDogJyc7XG4gICAgICAgICAgICBjb25zdCB0b29sdGlwU3JjOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBwcm9wRW50cnk/LnRvb2x0aXA7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFNyYyAmJiB0eXBlb2YgdG9vbHRpcFNyYyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLyoqICR7c2FuaXRpemVGb3JDb21tZW50KHRvb2x0aXBTcmMpfSAqL2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGVjb3JhdG9yID0gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IocHJvcEVudHJ5LCByZXNvbHZlZC5kZWNvcmF0b3JUeXBlKTtcbiAgICAgICAgICAgIGlmIChkZWNvcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtkZWNvcmF0b3J9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzYWZlUHJvcE5hbWUgPSBpc1NhZmVUc0lkZW50aWZpZXIocHJvcE5hbWUpID8gcHJvcE5hbWUgOiBKU09OLnN0cmluZ2lmeShwcm9wTmFtZSk7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtyZWFkb25seX0ke3NhZmVQcm9wTmFtZX06ICR7cmVzb2x2ZWQudHNUeXBlfTtgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNDb21wb25lbnQgJiYgQXJyYXkuaXNBcnJheShkdW1wPy5fX2NvbXBzX18pICYmIGR1bXAuX19jb21wc19fLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgICAvLyBDb21wb25lbnRzIG9uIHRoaXMgbm9kZSAoaW5zcGVjdCBlYWNoIHNlcGFyYXRlbHkgdmlhIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIHdpdGggdGhlIGhvc3Qgbm9kZSBVVUlEIGZpcnN0KTonKTtcbiAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGR1bXAuX19jb21wc19fKSB7XG4gICAgICAgICAgICBjb25zdCBjVHlwZSA9IHNhbml0aXplRm9yQ29tbWVudChTdHJpbmcoY29tcD8uX190eXBlX18gPz8gY29tcD8udHlwZSA/PyAndW5rbm93bicpKTtcbiAgICAgICAgICAgIGNvbnN0IGNVdWlkID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy52YWx1ZT8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZCA/PyAnPycpKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvLyAtICR7Y1R5cGV9ICB1dWlkPSR7Y1V1aWR9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgY3R4LmRlZmluaXRpb25zLnB1c2gobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogdG9vbHRpcHMgYW5kIGNvbXBvbmVudCBtZXRhZGF0YSBjYW5cbi8vIGNvbnRhaW4gYCovYCAoY2xvc2VzIHRoZSBkb2MgY29tbWVudCksIGBcXG5gIChicmVha3MgYSBgLy9gIGNvbW1lbnRcbi8vIGludG8gc3RyYXkgY29kZSksIG9yIGBcXHJgLiBTaW5nbGUtbGluZS1jb21tZW50IGNvbnRleHQgaXMgdGhlXG4vLyBkYW5nZXJvdXMgb25lLiBTdHJpcCBib3RoLlxuZnVuY3Rpb24gc2FuaXRpemVGb3JDb21tZW50KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRleHRcbiAgICAgICAgLnJlcGxhY2UoL1xcKlxcLy9nLCAnKlxcXFwvJylcbiAgICAgICAgLnJlcGxhY2UoL1xccj9cXG4vZywgJyAnKVxuICAgICAgICAucmVwbGFjZSgvXFxyL2csICcgJyk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB1bnNhbml0aXplZCBjdXN0b20tc2NyaXB0IGNsYXNzIG5hbWVzXG4vLyAoZS5nLiBgTXkuRm9vYCwgYE15LUZvb2ApIGVtaXR0ZWQgZGlyZWN0bHkgaW50byB0aGUgVFMgb3V0cHV0IHByb2R1Y2Vcbi8vIGludmFsaWQgVFMuIEpTT04tc3RyaW5naWZ5IGFueSBwcm9wZXJ0eSBuYW1lIHRoYXQgaXNuJ3QgYSBwbGFpbiBpZGVudC5cbmZ1bmN0aW9uIGlzU2FmZVRzSWRlbnRpZmllcihuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gL15bQS1aYS16XyRdW0EtWmEtejAtOV8kXSokLy50ZXN0KG5hbWUpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNQcm9wZXJ0eVR5cGUoY3R4OiBSZW5kZXJDb250ZXh0LCBvd25lckNsYXNzTmFtZTogc3RyaW5nLCBwcm9wTmFtZTogc3RyaW5nLCBlbnRyeTogYW55KTogUmVzb2x2ZWRQcm9wZXJ0eVR5cGUge1xuICAgIGNvbnN0IGlzQXJyYXkgPSAhIWVudHJ5Py5pc0FycmF5O1xuICAgIGNvbnN0IGl0ZW1FbnRyeSA9IGlzQXJyYXkgPyBhcnJheUl0ZW1FbnRyeShlbnRyeSkgOiBlbnRyeTtcbiAgICBjb25zdCBlbnVtTGlzdCA9IGVudW1PckJpdG1hc2tMaXN0KGl0ZW1FbnRyeSkgPz8gZW51bU9yQml0bWFza0xpc3QoZW50cnkpO1xuICAgIGlmIChlbnVtTGlzdCkge1xuICAgICAgICBjb25zdCBlbnVtTmFtZSA9IHBhc2NhbENhc2VOYW1lKHByb3BOYW1lKTtcbiAgICAgICAgZ2VuZXJhdGVDb25zdEVudW1EZWZpbml0aW9uKGN0eCwgZW51bU5hbWUsIGVudW1MaXN0KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHRzVHlwZTogaXNBcnJheSA/IGBBcnJheTwke2VudW1OYW1lfT5gIDogZW51bU5hbWUsXG4gICAgICAgICAgICBkZWNvcmF0b3JUeXBlOiBpc0FycmF5ID8gYFske2VudW1OYW1lfV1gIDogZW51bU5hbWUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3RydWN0VmFsdWUgPSBuZXN0ZWRTdHJ1Y3RWYWx1ZShpdGVtRW50cnkpO1xuICAgIGlmIChzdHJ1Y3RWYWx1ZSAmJiAhaXNDb21tb25WYWx1ZVR5cGUoaXRlbUVudHJ5Py50eXBlKSAmJiAhaXNSZWZlcmVuY2VFbnRyeShpdGVtRW50cnkpKSB7XG4gICAgICAgIGNvbnN0IHN0cnVjdE5hbWUgPSBuZXN0ZWRTdHJ1Y3RDbGFzc05hbWUob3duZXJDbGFzc05hbWUsIHByb3BOYW1lLCBzdHJ1Y3RWYWx1ZSwgaXNBcnJheSk7XG4gICAgICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgc3RydWN0TmFtZSwgc3RydWN0VmFsdWUsIGZhbHNlKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHRzVHlwZTogaXNBcnJheSA/IGBBcnJheTwke3N0cnVjdE5hbWV9PmAgOiBzdHJ1Y3ROYW1lLFxuICAgICAgICAgICAgZGVjb3JhdG9yVHlwZTogaXNBcnJheSA/IGBbJHtzdHJ1Y3ROYW1lfV1gIDogc3RydWN0TmFtZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCB0c1R5cGUgPSByZXNvbHZlVHNUeXBlKGl0ZW1FbnRyeSk7XG4gICAgcmV0dXJuIHsgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7dHNUeXBlfT5gIDogdHNUeXBlIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUc1R5cGUoZW50cnk6IGFueSk6IHN0cmluZyB7XG4gICAgaWYgKGVudHJ5ID09PSB1bmRlZmluZWQgfHwgZW50cnkgPT09IG51bGwpIHJldHVybiAndW5rbm93bic7XG4gICAgLy8gUGxhaW4gcHJpbWl0aXZlcyBwYXNzZWQgdGhyb3VnaCBkaXJlY3RseSAocmFyZSBpbiBkdW1wIHNoYXBlKS5cbiAgICBjb25zdCB0dCA9IHR5cGVvZiBlbnRyeTtcbiAgICBpZiAodHQgPT09ICdzdHJpbmcnKSByZXR1cm4gJ3N0cmluZyc7XG4gICAgaWYgKHR0ID09PSAnbnVtYmVyJykgcmV0dXJuICdudW1iZXInO1xuICAgIGlmICh0dCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xuXG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcblxuICAgIGxldCB0czogc3RyaW5nO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdTdHJpbmcnOiB0cyA9ICdzdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IHRzID0gJ2Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzInOiB0cyA9ICdWZWMyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzMnOiB0cyA9ICdWZWMzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzQnOiB0cyA9ICdWZWM0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLkNvbG9yJzogdHMgPSAnQ29sb3InOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUmVjdCc6IHRzID0gJ1JlY3QnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuU2l6ZSc6IHRzID0gJ1NpemUnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUXVhdCc6IHRzID0gJ1F1YXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0Myc6IHRzID0gJ01hdDMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0NCc6IHRzID0gJ01hdDQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJzogdHMgPSAndW5rbm93bic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogc2FuaXRpemUgY3VzdG9tIGNsYXNzIG5hbWVzXG4gICAgICAgICAgICAvLyBiZWZvcmUgcGFzdGluZyB0aGVtIGludG8gdGhlIFRTIG91dHB1dC4gYE15LkZvb2AgZXRjLlxuICAgICAgICAgICAgLy8gd291bGQgYmUgaW52YWxpZCBUUyBvdGhlcndpc2UuXG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZFR5cGUgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSkgfHwgJ3Vua25vd24nO1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ0NvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICB0cyA9IGlzUmVmZXJlbmNlID8gYEluc3RhbmNlUmVmZXJlbmNlPCR7c3RyaXBwZWRUeXBlfT5gIDogc3RyaXBwZWRUeXBlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cztcbn1cblxuZnVuY3Rpb24gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IoZW50cnk6IGFueSwgcmVzb2x2ZWRUeXBlPzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHR5cGVFeHByID0gcmVzb2x2ZWRUeXBlID8/IGRlY29yYXRvclR5cGVFeHByZXNzaW9uKGVudHJ5KTtcbiAgICBjb25zdCBoYXNFbnVtT3JCaXRtYXNrTGlzdCA9IGVudW1PckJpdG1hc2tMaXN0KGVudHJ5KSAhPT0gbnVsbFxuICAgICAgICB8fCBlbnVtT3JCaXRtYXNrTGlzdChhcnJheUl0ZW1FbnRyeShlbnRyeSkpICE9PSBudWxsO1xuICAgIGlmICgoZW50cnkudHlwZSAhPT0gdW5kZWZpbmVkIHx8IGhhc0VudW1PckJpdG1hc2tMaXN0KSAmJiB0eXBlRXhwcikge1xuICAgICAgICBwYXJ0cy5wdXNoKGB0eXBlOiAke3R5cGVFeHByfWApO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgYXR0ciBvZiBbJ21pbicsICdtYXgnLCAnc3RlcCcsICd1bml0JywgJ3JhZGlhbicsICdtdWx0aWxpbmUnLCAndG9vbHRpcCddKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZW50cnlbYXR0cl07XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGAke2F0dHJ9OiAke2RlY29yYXRvclZhbHVlKHZhbHVlKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIHJldHVybiBgQHByb3BlcnR5KHsgJHtwYXJ0cy5qb2luKCcsICcpfSB9KWA7XG59XG5cbmZ1bmN0aW9uIGRlY29yYXRvclR5cGVFeHByZXNzaW9uKGVudHJ5OiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBpc0FycmF5ID0gISFlbnRyeT8uaXNBcnJheTtcbiAgICBjb25zdCBpdGVtRW50cnkgPSBpc0FycmF5ID8gYXJyYXlJdGVtRW50cnkoZW50cnkpIDogZW50cnk7XG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gaXRlbUVudHJ5Py50eXBlO1xuICAgIGlmICghcmF3VHlwZSkgcmV0dXJuIG51bGw7XG5cbiAgICBsZXQgZXhwcjogc3RyaW5nIHwgbnVsbDtcbiAgICBzd2l0Y2ggKHJhd1R5cGUpIHtcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6IGV4cHIgPSAnQ0NJbnRlZ2VyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogZXhwciA9ICdDQ0Zsb2F0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6IGV4cHIgPSAnU3RyaW5nJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOiBleHByID0gJ0Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgIGNhc2UgJ0JpdE1hc2snOiBleHByID0gJ051bWJlcic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiBleHByID0gc2FuaXRpemVUc05hbWUocmF3VHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykpO1xuICAgIH1cbiAgICBpZiAoIWV4cHIpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBpc0FycmF5ID8gYFske2V4cHJ9XWAgOiBleHByO1xufVxuXG5mdW5jdGlvbiBkZWNvcmF0b3JWYWx1ZSh2YWx1ZTogYW55KTogc3RyaW5nIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gYXJyYXlJdGVtRW50cnkoZW50cnk6IGFueSk6IGFueSB7XG4gICAgaWYgKGVudHJ5Py5lbGVtZW50VHlwZURhdGEpIHJldHVybiBlbnRyeS5lbGVtZW50VHlwZURhdGE7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50cnk/LnZhbHVlKSAmJiBlbnRyeS52YWx1ZS5sZW5ndGggPiAwKSByZXR1cm4gZW50cnkudmFsdWVbMF07XG4gICAgcmV0dXJuIGVudHJ5O1xufVxuXG5mdW5jdGlvbiBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeTogYW55KTogYW55W10gfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGVudHJ5LmVudW1MaXN0KSA/IGVudHJ5LmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeS5iaXRtYXNrTGlzdCkgPyBlbnRyeS5iaXRtYXNrTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5lbnVtTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5iaXRtYXNrTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5iaXRtYXNrTGlzdFxuICAgICAgICA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlQ29uc3RFbnVtRGVmaW5pdGlvbihjdHg6IFJlbmRlckNvbnRleHQsIGVudW1OYW1lOiBzdHJpbmcsIGl0ZW1zOiBhbnlbXSk6IHZvaWQge1xuICAgIGNvbnN0IHNhZmVFbnVtTmFtZSA9IHNhbml0aXplVHNOYW1lKGVudW1OYW1lKTtcbiAgICBpZiAoY3R4LmRlZmluZWROYW1lcy5oYXMoc2FmZUVudW1OYW1lKSkgcmV0dXJuO1xuICAgIGN0eC5kZWZpbmVkTmFtZXMuYWRkKHNhZmVFbnVtTmFtZSk7XG5cbiAgICBjb25zdCB1c2VkTWVtYmVyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbYGNvbnN0IGVudW0gJHtzYWZlRW51bU5hbWV9IHtgXTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCByYXdOYW1lID0gaXRlbT8ubmFtZSA/PyBpdGVtPy5kaXNwbGF5TmFtZSA/PyBpdGVtPy52YWx1ZSA/PyBgVmFsdWUke2luZGV4fWA7XG4gICAgICAgIGxldCBtZW1iZXJOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHJhd05hbWUpKTtcbiAgICAgICAgaWYgKHVzZWRNZW1iZXJOYW1lcy5oYXMobWVtYmVyTmFtZSkpIHtcbiAgICAgICAgICAgIG1lbWJlck5hbWUgPSBgJHttZW1iZXJOYW1lfV8ke2luZGV4fWA7XG4gICAgICAgIH1cbiAgICAgICAgdXNlZE1lbWJlck5hbWVzLmFkZChtZW1iZXJOYW1lKTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBpdGVtPy52YWx1ZTtcbiAgICAgICAgY29uc3QgaW5pdGlhbGl6ZXIgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKVxuICAgICAgICAgICAgOiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyBTdHJpbmcodmFsdWUpXG4gICAgICAgICAgICAgICAgOiBTdHJpbmcoaW5kZXgpO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHttZW1iZXJOYW1lfSA9ICR7aW5pdGlhbGl6ZXJ9LGApO1xuICAgIH0pO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBjdHguZGVmaW5pdGlvbnMucHVzaChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbmZ1bmN0aW9uIG5lc3RlZFN0cnVjdFZhbHVlKGVudHJ5OiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHZhbHVlID0gZW50cnkudmFsdWU7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpICYmICdfX3R5cGVfXycgaW4gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAoJ19fdHlwZV9fJyBpbiBlbnRyeSAmJiAhKCd0eXBlJyBpbiBlbnRyeSkpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbmVzdGVkU3RydWN0Q2xhc3NOYW1lKG93bmVyQ2xhc3NOYW1lOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnksIGlzQXJyYXk6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgIGNvbnN0IHR5cGVOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHZhbHVlPy5fX3R5cGVfXyA/PyAnJykucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbiAgICBpZiAodHlwZU5hbWUgJiYgdHlwZU5hbWUgIT09ICdfVW5rbm93bicgJiYgdHlwZU5hbWUgIT09ICdPYmplY3QnKSB7XG4gICAgICAgIHJldHVybiB0eXBlTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhbml0aXplVHNOYW1lKGAke293bmVyQ2xhc3NOYW1lfSR7cGFzY2FsQ2FzZU5hbWUocHJvcE5hbWUpfSR7aXNBcnJheSA/ICdJdGVtJyA6ICdUeXBlJ31gKTtcbn1cblxuZnVuY3Rpb24gaXNDb21tb25WYWx1ZVR5cGUodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdjYy5WZWMyJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuVmVjMydcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlZlYzQnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5Db2xvcidcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlJlY3QnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5TaXplJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuUXVhdCdcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLk1hdDMnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5NYXQ0Jztcbn1cblxuZnVuY3Rpb24gaXNSZWZlcmVuY2VFbnRyeShlbnRyeTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcbiAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdDb21wb25lbnQnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICB8fCAocmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKSAmJiAhaXNDb21tb25WYWx1ZVR5cGUocmF3VHlwZSkpO1xufVxuXG5mdW5jdGlvbiBwYXNjYWxDYXNlTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHdvcmRzID0gU3RyaW5nKG5hbWUgPz8gJycpXG4gICAgICAgIC5yZXBsYWNlKC8oW2EtejAtOV0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAuc3BsaXQoL1teQS1aYS16MC05XSsvKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgIGNvbnN0IHBhc2NhbCA9IHdvcmRzLm1hcCgod29yZCkgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkpLmpvaW4oJycpO1xuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShwYXNjYWwgfHwgbmFtZSB8fCAnVmFsdWUnKTtcbn1cblxuZnVuY3Rpb24gaXNDb21wb25lbnREdW1wKGR1bXA6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZHVtcCB8fCB0eXBlb2YgZHVtcCAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICcnKTtcbiAgICBpZiAocmF3VHlwZSA9PT0gJ05vZGUnIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGV4dGVuZHNMaXN0OiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoZHVtcC5leHRlbmRzKSA/IGR1bXAuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuQ29tcG9uZW50JykgfHwgIUFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pO1xufVxuXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0aGUgdjIuNC4xIGltcGxlbWVudGF0aW9uIG9ubHkgc3RyaXBwZWRcbi8vIG5vbi1pZGVudGlmaWVyIGNoYXJhY3RlcnMgYnV0IGRpZG4ndCBndWFyZCBhZ2FpbnN0IGEgZGlnaXQtbGVhZGluZ1xuLy8gcmVzdWx0IChgY2xhc3MgMmRTcHJpdGVgKSBvciBhbiBlbXB0eSByZXN1bHQgKGFmdGVyIHN0cmlwcGluZyBhbGxcbi8vIGNoYXJzIGluIGEgVVVJRC1zaGFwZWQgX190eXBlX18pLiBCb3RoIHByb2R1Y2UgaW52YWxpZCBUUy4gUHJlZml4XG4vLyBkaWdpdC1sZWFkaW5nIGFuZCBlbXB0eSBjYXNlcyB3aXRoIGBfYCAvIGBfVW5rbm93bmAuXG5mdW5jdGlvbiBzYW5pdGl6ZVRzTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBTdHJpbmcobmFtZSA/PyAnJykucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCAnXycpO1xuICAgIGlmIChjbGVhbmVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdfVW5rbm93bic7XG4gICAgaWYgKC9eWzAtOV0vLnRlc3QoY2xlYW5lZCkpIHJldHVybiBgXyR7Y2xlYW5lZH1gO1xuICAgIHJldHVybiBjbGVhbmVkO1xufVxuIl19