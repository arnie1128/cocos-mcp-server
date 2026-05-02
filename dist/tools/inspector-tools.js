"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectorTools = void 0;
const response_1 = require("../lib/response");
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
        return (0, response_1.ok)({ definition: COMMON_TYPES_DEFINITION });
    }
    async getInstanceDefinition(args) {
        var _a, _b, _c, _d;
        const { reference } = args;
        if (!(reference === null || reference === void 0 ? void 0 : reference.id)) {
            return (0, response_1.fail)('inspector_get_instance_definition: reference.id is required');
        }
        try {
            const dump = await Editor.Message.request('scene', 'query-node', reference.id);
            if (!dump) {
                return (0, response_1.fail)(`inspector: query-node returned no dump for ${reference.id}.`);
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
            return (0, response_1.fail)(`inspector: query-node failed: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBRXZGLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsbUVBQW1FO0FBQ25FLHNFQUFzRTtBQUN0RSw4QkFBOEI7QUFDOUIsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUNwQyxVQUFVLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxrQkFBa0I7SUFDekQsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNO0lBQzFCLFVBQVUsRUFBRSxRQUFRO0lBQ3BCLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsaUJBQWlCO0lBQzlELG1CQUFtQixFQUFFLGFBQWE7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsTUFBYSxjQUFjO0lBR3ZCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFRbkcsQUFBTixLQUFLLENBQUMsd0JBQXdCO1FBQzFCLE9BQU8sSUFBQSxhQUFFLEVB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QVcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNsRixDQUFDO0FBRUQscUVBQXFFO0FBQ3JFLHFFQUFxRTtBQUNyRSxvRUFBb0U7QUFDcEUsb0VBQW9FO0FBQ3BFLHVEQUF1RDtBQUN2RCxTQUFTLGNBQWMsQ0FBQyxJQUFZO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLGFBQUosSUFBSSxjQUFKLElBQUksR0FBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbEUsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUM7UUFBRSxPQUFPLFVBQVUsQ0FBQztJQUM1QyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQUUsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBQ2pELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG4vKipcbiAqIGluc3BlY3Rvci10b29scyDigJQgVHlwZVNjcmlwdCBjbGFzcy1kZWZpbml0aW9uIGdlbmVyYXRvciBiYWNrZWQgYnlcbiAqIGNvY29zIGBzY2VuZS9xdWVyeS1ub2RlYCBkdW1wcy5cbiAqXG4gKiBUd28gTUNQIHRvb2xzOlxuICogICAtIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiAg4oCUIGZvciBhICoqbm9kZSoqIG9yXG4gKiAgICAgY29tcG9uZW50IHJlZmVyZW5jZSwgd2FsayB0aGUgY29jb3MgZHVtcCBhbmQgZW1pdCBhIFR5cGVTY3JpcHRcbiAqICAgICBjbGFzcyBkZWNsYXJhdGlvbiBBSSBjYW4gcmVhZCBiZWZvcmUgY2hhbmdpbmcgcHJvcGVydGllcy4gQXZvaWRzXG4gKiAgICAgdGhlIFwiQUkgZ3Vlc3NlcyBwcm9wZXJ0eSBuYW1lXCIgZmFpbHVyZSBtb2RlLlxuICogICAtIGluc3BlY3Rvcl9nZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24g4oCUIHJldHVybiBoYXJkY29kZWRcbiAqICAgICBkZWZpbml0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgZXRjLilcbiAqICAgICB0aGF0IHRoZSBpbnN0YW5jZSBkZWZpbml0aW9uIHJlZmVyZW5jZXMgYnV0IGRvZXNuJ3QgaW5saW5lLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtY29kZS1tb2RlIChSb21hUm9nb3YpXG4gKiBgRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvY29jb3MtY29kZS1tb2RlL3NvdXJjZS91dGNwL3Rvb2xzL3R5cGVzY3JpcHQtZGVmZW5pdGlvbi50c2AuXG4gKiBPdXIgaW1wbCB3YWxrcyBwcm9wZXJ0eSBkdW1wcywgZGVjb3JhdG9ycywgZW51bS9CaXRNYXNrIG1ldGFkYXRhLFxuICogbmVzdGVkIHN0cnVjdHMsIGFycmF5cywgYW5kIHJlZmVyZW5jZXMuXG4gKlxuICogRGVtb25zdHJhdGVzIHRoZSBAbWNwVG9vbCBkZWNvcmF0b3IgKHYyLjQuMCBzdGVwIDUpLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgSW5zdGFuY2VSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcblxuY29uc3QgQ09NTU9OX1RZUEVTX0RFRklOSVRJT04gPSBgLy8gQ29jb3MgY29tbW9uIHZhbHVlIHR5cGVzIOKAlCByZWZlcmVuY2VkIGJ5IGluc3RhbmNlIGRlZmluaXRpb25zLlxudHlwZSBJbnN0YW5jZVJlZmVyZW5jZTxUID0gdW5rbm93bj4gPSB7IGlkOiBzdHJpbmc7IHR5cGU/OiBzdHJpbmcgfTtcbmNsYXNzIFZlYzIgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgfVxuY2xhc3MgVmVjMyB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH1cbmNsYXNzIFZlYzQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIENvbG9yIHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyOyB9XG5jbGFzcyBSZWN0IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9XG5jbGFzcyBTaXplIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFF1YXQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIE1hdDMgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyO1xuICBtMDM6IG51bWJlcjsgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyO1xuICBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7IG0wODogbnVtYmVyOyB9XG5jbGFzcyBNYXQ0IHsgbTAwOiBudW1iZXI7IG0wMTogbnVtYmVyOyBtMDI6IG51bWJlcjsgbTAzOiBudW1iZXI7XG4gIG0wNDogbnVtYmVyOyBtMDU6IG51bWJlcjsgbTA2OiBudW1iZXI7IG0wNzogbnVtYmVyO1xuICBtMDg6IG51bWJlcjsgbTA5OiBudW1iZXI7IG0xMDogbnVtYmVyOyBtMTE6IG51bWJlcjtcbiAgbTEyOiBudW1iZXI7IG0xMzogbnVtYmVyOyBtMTQ6IG51bWJlcjsgbTE1OiBudW1iZXI7IH1cbmA7XG5cbi8vIE5hbWVzIHRoYXQgc2hvdyB1cCBhdCB0aGUgdG9wIG9mIGV2ZXJ5IG5vZGUgZHVtcCBidXQgYXJlbid0XG4vLyB1c2VyLWZhY2luZyBwcm9wZXJ0aWVzOyBzdXBwcmVzcyBmcm9tIGdlbmVyYXRlZCBkZWZpbml0aW9ucy5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjb2RleCk6IGV4cGFuZGVkIGZyb20gdGhlIHYyLjQuMCBtaW5pbWFsIGxpc3QgdG9cbi8vIGNvdmVyIHByZWZhYi1pbnN0YW5jZS9zZXJpYWxpemF0aW9uIG1ldGFkYXRhIGFuZCBlZGl0b3Itb25seSBmaWVsZHNcbi8vIHRoYXQgQUkgc2hvdWxkbid0IHRyeSB0byBtdXRhdGUuXG4vL1xuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4K2NsYXVkZStnZW1pbmkpOiBDT01QT05FTlRfSU5URVJOQUxfS0VZUyB3YXNcbi8vIHJlbW92ZWQgYWZ0ZXIgZHJpZnRpbmcgb3V0IG9mIHN5bmMgd2l0aCBjb2NvcyBlZGl0b3IuIFRoZSBzaGFyZWRcbi8vIHJlbmRlcmVyIGtlZXBzIHRoaXMgY29uc2VydmF0aXZlIG5vZGUgbWV0YWRhdGEgZmlsdGVyIGZvciBib3RoIG5vZGVcbi8vIGFuZCBjb21wb25lbnQtc2hhcGVkIGR1bXBzLlxuY29uc3QgTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVMgPSBuZXcgU2V0KFtcbiAgICAnX190eXBlX18nLCAnX19jb21wc19fJywgJ19fcHJlZmFiX18nLCAnX19lZGl0b3JFeHRyYXNfXycsXG4gICAgJ19vYmpGbGFncycsICdfaWQnLCAndXVpZCcsXG4gICAgJ2NoaWxkcmVuJywgJ3BhcmVudCcsXG4gICAgJ19wcmVmYWJJbnN0YW5jZScsICdfcHJlZmFiJywgJ21vdW50ZWRSb290JywgJ21vdW50ZWRDaGlsZHJlbicsXG4gICAgJ3JlbW92ZWRDb21wb25lbnRzJywgJ19jb21wb25lbnRzJyxcbl0pO1xuXG5leHBvcnQgY2xhc3MgSW5zcGVjdG9yVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2NvbW1vbl90eXBlc19kZWZpbml0aW9uJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGNvY29zIGNvbW1vbiB0eXBlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIGhhcmRjb2RlZCBUeXBlU2NyaXB0IGRlY2xhcmF0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgU2l6ZSwgUXVhdCwgTWF0My80KSBhbmQgdGhlIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLiBBSSBjYW4gcHJlcGVuZCB0aGlzIHRvIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiBvdXRwdXQgYmVmb3JlIGdlbmVyYXRpbmcgdHlwZS1zYWZlIGNvZGUuIE5vIHNjZW5lIHF1ZXJ5LiBTdXBwb3J0cyBib3RoIG5vZGUgYW5kIGNvbXBvbmVudCBpbnN0YW5jZSBkdW1wcyBpbmNsdWRpbmcgQHByb3BlcnR5IGRlY29yYXRvcnMgYW5kIGVudW0gdHlwZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldENvbW1vblR5cGVzRGVmaW5pdGlvbigpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gb2soeyBkZWZpbml0aW9uOiBDT01NT05fVFlQRVNfREVGSU5JVElPTiB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfaW5zdGFuY2VfZGVmaW5pdGlvbicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBpbnN0YW5jZSBUUyBkZWZpbml0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGEgc2NlbmUgbm9kZSwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHNjZW5lL3F1ZXJ5LW5vZGUgZHVtcC4gVGhlIGdlbmVyYXRlZCBjbGFzcyBpbmNsdWRlcyBhIGNvbW1lbnQgbGlzdGluZyB0aGUgY29tcG9uZW50cyBhdHRhY2hlZCB0byB0aGUgbm9kZSAod2l0aCBVVUlEcykuIEFJIHNob3VsZCBjYWxsIHRoaXMgQkVGT1JFIHdyaXRpbmcgcHJvcGVydGllcyBzbyBpdCBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciB3aXRoIGdldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiBmb3IgVmVjMi9Db2xvci9ldGMgcmVmZXJlbmNlcy4gU3VwcG9ydHMgYm90aCBub2RlIGFuZCBjb21wb25lbnQgaW5zdGFuY2UgZHVtcHMgaW5jbHVkaW5nIEBwcm9wZXJ0eSBkZWNvcmF0b3JzIGFuZCBlbnVtIHR5cGVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBvciBjb21wb25lbnQuIHtpZH0gPSBpbnN0YW5jZSBVVUlELCB7dHlwZX0gb3B0aW9uYWwgY2MgY2xhc3MgbGFiZWwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0SW5zdGFuY2VEZWZpbml0aW9uKGFyZ3M6IHsgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCByZWZlcmVuY2UuaWQpO1xuICAgICAgICAgICAgaWYgKCFkdW1wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGluc3BlY3RvcjogcXVlcnktbm9kZSByZXR1cm5lZCBubyBkdW1wIGZvciAke3JlZmVyZW5jZS5pZH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0cnVzdCB0aGUgZHVtcCdzIF9fdHlwZV9fLCBub3RcbiAgICAgICAgICAgIC8vIHRoZSBjYWxsZXItc3VwcGxpZWQgcmVmZXJlbmNlLnR5cGUuIEEgY2FsbGVyIHBhc3NpbmdcbiAgICAgICAgICAgIC8vIHtpZDogbm9kZVV1aWQsIHR5cGU6ICdjYy5TcHJpdGUnfSBvdGhlcndpc2UgZ290IGEgbm9kZVxuICAgICAgICAgICAgLy8gZHVtcCByZW5kZXJlZCBhcyBgY2xhc3MgU3ByaXRlYCwgbWlzbGFiZWxsaW5nIHRoZVxuICAgICAgICAgICAgLy8gZGVjbGFyYXRpb24gZW50aXJlbHkuIHJlZmVyZW5jZS50eXBlIGlzIG5vdyBkaWFnbm9zdGljXG4gICAgICAgICAgICAvLyBvbmx5IOKAlCBzdXJmYWNlZCBpbiB0aGUgcmVzcG9uc2UgZGF0YSBzbyBjYWxsZXJzIGNhbiBzZWVcbiAgICAgICAgICAgIC8vIGEgbWlzbWF0Y2ggYnV0IG5ldmVyIHVzZWQgYXMgdGhlIGNsYXNzIG5hbWUuXG4gICAgICAgICAgICBjb25zdCBkdW1wVHlwZSA9IFN0cmluZyhkdW1wLl9fdHlwZV9fID8/IGR1bXAudHlwZSA/PyAnQ29jb3NJbnN0YW5jZScpO1xuICAgICAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gZHVtcFR5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpO1xuICAgICAgICAgICAgY29uc3QgcmVmZXJlbmNlVHlwZU1pc21hdGNoID0gcmVmZXJlbmNlLnR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZSAhPT0gZHVtcFR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykgIT09IGNsYXNzTmFtZTtcbiAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWUsIGR1bXAsIGlzQ29tcG9uZW50RHVtcChkdW1wKSk7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZTogVG9vbFJlc3BvbnNlID0ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IHsgaWQ6IHJlZmVyZW5jZS5pZCwgdHlwZTogZHVtcC5fX3R5cGVfXyA/PyByZWZlcmVuY2UudHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChyZWZlcmVuY2VUeXBlTWlzbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5nID0gYGluc3BlY3RvcjogcmVmZXJlbmNlLnR5cGUgKCR7cmVmZXJlbmNlLnR5cGV9KSBkb2VzIG5vdCBtYXRjaCBkdW1wIF9fdHlwZV9fICgke2R1bXBUeXBlfSk7IGNsYXNzIGxhYmVsIHVzZXMgdGhlIGR1bXAgdmFsdWVgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGluc3BlY3RvcjogcXVlcnktbm9kZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIFJlbmRlciBhIHNpbmdsZSBjbGFzcyBkZWNsYXJhdGlvbi4gRm9yIG5vZGVzLCBhbHNvIGVudW1lcmF0ZVxuICogY29tcG9uZW50cyBmcm9tIGBfX2NvbXBzX19gIGFzIGEgY29tbWVudCBzbyBBSSBrbm93cyB3aGljaFxuICogc3ViLWluc3RhbmNlcyBleGlzdCAod2l0aG91dCBpbmxpbmluZyB0aGVpciBmdWxsIFRTIOKAlCB0aG9zZVxuICogcmVxdWlyZSBhIHNlcGFyYXRlIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIGNhbGwgYnkgY29tcG9uZW50XG4gKiBVVUlEKS5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZHVtcDogYW55LCBpc0NvbXBvbmVudDogYm9vbGVhbik6IHN0cmluZyB7XG4gICAgY29uc3QgY3R4OiBSZW5kZXJDb250ZXh0ID0geyBkZWZpbml0aW9uczogW10sIGRlZmluZWROYW1lczogbmV3IFNldDxzdHJpbmc+KCkgfTtcbiAgICBwcm9jZXNzVHNDbGFzcyhjdHgsIGNsYXNzTmFtZSwgZHVtcCwgaXNDb21wb25lbnQpO1xuICAgIHJldHVybiBjdHguZGVmaW5pdGlvbnMuam9pbignXFxuXFxuJyk7XG59XG5cbmludGVyZmFjZSBSZW5kZXJDb250ZXh0IHtcbiAgICBkZWZpbml0aW9uczogc3RyaW5nW107XG4gICAgZGVmaW5lZE5hbWVzOiBTZXQ8c3RyaW5nPjtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkUHJvcGVydHlUeXBlIHtcbiAgICB0c1R5cGU6IHN0cmluZztcbiAgICBkZWNvcmF0b3JUeXBlPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzVHNDbGFzcyhjdHg6IFJlbmRlckNvbnRleHQsIGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3Qgc2FmZUNsYXNzTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyhjbGFzc05hbWUgPz8gJycpLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgaWYgKGN0eC5kZWZpbmVkTmFtZXMuaGFzKHNhZmVDbGFzc05hbWUpKSByZXR1cm47XG4gICAgY3R4LmRlZmluZWROYW1lcy5hZGQoc2FmZUNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBjbGFzcyAke3NhZmVDbGFzc05hbWV9JHtpc0NvbXBvbmVudCA/ICcgZXh0ZW5kcyBDb21wb25lbnQnIDogJyd9IHtgKTtcblxuICAgIGlmIChkdW1wICYmIHR5cGVvZiBkdW1wID09PSAnb2JqZWN0Jykge1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BOYW1lIG9mIE9iamVjdC5rZXlzKGR1bXApKSB7XG4gICAgICAgICAgICBpZiAoTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVMuaGFzKHByb3BOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBwcm9wRW50cnkgPSBkdW1wW3Byb3BOYW1lXTtcbiAgICAgICAgICAgIGlmIChwcm9wRW50cnkgPT09IHVuZGVmaW5lZCB8fCBwcm9wRW50cnkgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgLy8gQ29jb3MgZHVtcCBlbnRyaWVzIGFyZSB0eXBpY2FsbHkgYHt0eXBlLCB2YWx1ZSwgdmlzaWJsZT8sIHJlYWRvbmx5PywgLi4ufWAuXG4gICAgICAgICAgICAvLyBTa2lwIGV4cGxpY2l0bHktaGlkZGVuIGluc3BlY3RvciBmaWVsZHM7IHRoZXkncmUgbm90IHVzZXItZmFjaW5nLlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wRW50cnkgPT09ICdvYmplY3QnICYmIHByb3BFbnRyeS52aXNpYmxlID09PSBmYWxzZSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRzUHJvcGVydHlUeXBlKGN0eCwgc2FmZUNsYXNzTmFtZSwgcHJvcE5hbWUsIHByb3BFbnRyeSk7XG4gICAgICAgICAgICBjb25zdCByZWFkb25seSA9IHByb3BFbnRyeT8ucmVhZG9ubHkgPyAncmVhZG9ubHkgJyA6ICcnO1xuICAgICAgICAgICAgY29uc3QgdG9vbHRpcFNyYzogc3RyaW5nIHwgdW5kZWZpbmVkID0gcHJvcEVudHJ5Py50b29sdGlwO1xuICAgICAgICAgICAgaWYgKHRvb2x0aXBTcmMgJiYgdHlwZW9mIHRvb2x0aXBTcmMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8qKiAke3Nhbml0aXplRm9yQ29tbWVudCh0b29sdGlwU3JjKX0gKi9gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvciA9IHJlbmRlclByb3BlcnR5RGVjb3JhdG9yKHByb3BFbnRyeSwgcmVzb2x2ZWQuZGVjb3JhdG9yVHlwZSk7XG4gICAgICAgICAgICBpZiAoZGVjb3JhdG9yKSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaChgICAgICR7ZGVjb3JhdG9yfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc2FmZVByb3BOYW1lID0gaXNTYWZlVHNJZGVudGlmaWVyKHByb3BOYW1lKSA/IHByb3BOYW1lIDogSlNPTi5zdHJpbmdpZnkocHJvcE5hbWUpO1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgICR7cmVhZG9ubHl9JHtzYWZlUHJvcE5hbWV9OiAke3Jlc29sdmVkLnRzVHlwZX07YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWlzQ29tcG9uZW50ICYmIEFycmF5LmlzQXJyYXkoZHVtcD8uX19jb21wc19fKSAmJiBkdW1wLl9fY29tcHNfXy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcgICAgLy8gQ29tcG9uZW50cyBvbiB0aGlzIG5vZGUgKGluc3BlY3QgZWFjaCBzZXBhcmF0ZWx5IHZpYSBnZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiB3aXRoIHRoZSBob3N0IG5vZGUgVVVJRCBmaXJzdCk6Jyk7XG4gICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBkdW1wLl9fY29tcHNfXykge1xuICAgICAgICAgICAgY29uc3QgY1R5cGUgPSBzYW5pdGl6ZUZvckNvbW1lbnQoU3RyaW5nKGNvbXA/Ll9fdHlwZV9fID8/IGNvbXA/LnR5cGUgPz8gJ3Vua25vd24nKSk7XG4gICAgICAgICAgICBjb25zdCBjVXVpZCA9IHNhbml0aXplRm9yQ29tbWVudChTdHJpbmcoY29tcD8udmFsdWU/LnV1aWQ/LnZhbHVlID8/IGNvbXA/LnV1aWQ/LnZhbHVlID8/IGNvbXA/LnV1aWQgPz8gJz8nKSk7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLy8gLSAke2NUeXBlfSAgdXVpZD0ke2NVdWlkfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIGN0eC5kZWZpbml0aW9ucy5wdXNoKGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHRvb2x0aXBzIGFuZCBjb21wb25lbnQgbWV0YWRhdGEgY2FuXG4vLyBjb250YWluIGAqL2AgKGNsb3NlcyB0aGUgZG9jIGNvbW1lbnQpLCBgXFxuYCAoYnJlYWtzIGEgYC8vYCBjb21tZW50XG4vLyBpbnRvIHN0cmF5IGNvZGUpLCBvciBgXFxyYC4gU2luZ2xlLWxpbmUtY29tbWVudCBjb250ZXh0IGlzIHRoZVxuLy8gZGFuZ2Vyb3VzIG9uZS4gU3RyaXAgYm90aC5cbmZ1bmN0aW9uIHNhbml0aXplRm9yQ29tbWVudCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiB0ZXh0XG4gICAgICAgIC5yZXBsYWNlKC9cXCpcXC8vZywgJypcXFxcLycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHI/XFxuL2csICcgJylcbiAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnICcpO1xufVxuXG4vLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogdW5zYW5pdGl6ZWQgY3VzdG9tLXNjcmlwdCBjbGFzcyBuYW1lc1xuLy8gKGUuZy4gYE15LkZvb2AsIGBNeS1Gb29gKSBlbWl0dGVkIGRpcmVjdGx5IGludG8gdGhlIFRTIG91dHB1dCBwcm9kdWNlXG4vLyBpbnZhbGlkIFRTLiBKU09OLXN0cmluZ2lmeSBhbnkgcHJvcGVydHkgbmFtZSB0aGF0IGlzbid0IGEgcGxhaW4gaWRlbnQuXG5mdW5jdGlvbiBpc1NhZmVUc0lkZW50aWZpZXIobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIC9eW0EtWmEtel8kXVtBLVphLXowLTlfJF0qJC8udGVzdChuYW1lKTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVRzUHJvcGVydHlUeXBlKGN0eDogUmVuZGVyQ29udGV4dCwgb3duZXJDbGFzc05hbWU6IHN0cmluZywgcHJvcE5hbWU6IHN0cmluZywgZW50cnk6IGFueSk6IFJlc29sdmVkUHJvcGVydHlUeXBlIHtcbiAgICBjb25zdCBpc0FycmF5ID0gISFlbnRyeT8uaXNBcnJheTtcbiAgICBjb25zdCBpdGVtRW50cnkgPSBpc0FycmF5ID8gYXJyYXlJdGVtRW50cnkoZW50cnkpIDogZW50cnk7XG4gICAgY29uc3QgZW51bUxpc3QgPSBlbnVtT3JCaXRtYXNrTGlzdChpdGVtRW50cnkpID8/IGVudW1PckJpdG1hc2tMaXN0KGVudHJ5KTtcbiAgICBpZiAoZW51bUxpc3QpIHtcbiAgICAgICAgY29uc3QgZW51bU5hbWUgPSBwYXNjYWxDYXNlTmFtZShwcm9wTmFtZSk7XG4gICAgICAgIGdlbmVyYXRlQ29uc3RFbnVtRGVmaW5pdGlvbihjdHgsIGVudW1OYW1lLCBlbnVtTGlzdCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0c1R5cGU6IGlzQXJyYXkgPyBgQXJyYXk8JHtlbnVtTmFtZX0+YCA6IGVudW1OYW1lLFxuICAgICAgICAgICAgZGVjb3JhdG9yVHlwZTogaXNBcnJheSA/IGBbJHtlbnVtTmFtZX1dYCA6IGVudW1OYW1lLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHN0cnVjdFZhbHVlID0gbmVzdGVkU3RydWN0VmFsdWUoaXRlbUVudHJ5KTtcbiAgICBpZiAoc3RydWN0VmFsdWUgJiYgIWlzQ29tbW9uVmFsdWVUeXBlKGl0ZW1FbnRyeT8udHlwZSkgJiYgIWlzUmVmZXJlbmNlRW50cnkoaXRlbUVudHJ5KSkge1xuICAgICAgICBjb25zdCBzdHJ1Y3ROYW1lID0gbmVzdGVkU3RydWN0Q2xhc3NOYW1lKG93bmVyQ2xhc3NOYW1lLCBwcm9wTmFtZSwgc3RydWN0VmFsdWUsIGlzQXJyYXkpO1xuICAgICAgICBwcm9jZXNzVHNDbGFzcyhjdHgsIHN0cnVjdE5hbWUsIHN0cnVjdFZhbHVlLCBmYWxzZSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0c1R5cGU6IGlzQXJyYXkgPyBgQXJyYXk8JHtzdHJ1Y3ROYW1lfT5gIDogc3RydWN0TmFtZSxcbiAgICAgICAgICAgIGRlY29yYXRvclR5cGU6IGlzQXJyYXkgPyBgWyR7c3RydWN0TmFtZX1dYCA6IHN0cnVjdE5hbWUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgdHNUeXBlID0gcmVzb2x2ZVRzVHlwZShpdGVtRW50cnkpO1xuICAgIHJldHVybiB7IHRzVHlwZTogaXNBcnJheSA/IGBBcnJheTwke3RzVHlwZX0+YCA6IHRzVHlwZSB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNUeXBlKGVudHJ5OiBhbnkpOiBzdHJpbmcge1xuICAgIGlmIChlbnRyeSA9PT0gdW5kZWZpbmVkIHx8IGVudHJ5ID09PSBudWxsKSByZXR1cm4gJ3Vua25vd24nO1xuICAgIC8vIFBsYWluIHByaW1pdGl2ZXMgcGFzc2VkIHRocm91Z2ggZGlyZWN0bHkgKHJhcmUgaW4gZHVtcCBzaGFwZSkuXG4gICAgY29uc3QgdHQgPSB0eXBlb2YgZW50cnk7XG4gICAgaWYgKHR0ID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0dCA9PT0gJ251bWJlcicpIHJldHVybiAnbnVtYmVyJztcbiAgICBpZiAodHQgPT09ICdib29sZWFuJykgcmV0dXJuICdib29sZWFuJztcblxuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG5cbiAgICBsZXQgdHM6IHN0cmluZztcbiAgICBzd2l0Y2ggKHJhd1R5cGUpIHtcbiAgICAgICAgY2FzZSAnU3RyaW5nJzogdHMgPSAnc3RyaW5nJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOiB0cyA9ICdib29sZWFuJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ludGVnZXInOlxuICAgICAgICBjYXNlICdGbG9hdCc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6IHRzID0gJ251bWJlcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdFbnVtJzpcbiAgICAgICAgY2FzZSAnQml0TWFzayc6IHRzID0gJ251bWJlcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5WZWMyJzogdHMgPSAnVmVjMic7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5WZWMzJzogdHMgPSAnVmVjMyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5WZWM0JzogdHMgPSAnVmVjNCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5Db2xvcic6IHRzID0gJ0NvbG9yJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlJlY3QnOiB0cyA9ICdSZWN0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlNpemUnOiB0cyA9ICdTaXplJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlF1YXQnOiB0cyA9ICdRdWF0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLk1hdDMnOiB0cyA9ICdNYXQzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLk1hdDQnOiB0cyA9ICdNYXQ0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJyc6IHRzID0gJ3Vua25vd24nOyBicmVhaztcbiAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHNhbml0aXplIGN1c3RvbSBjbGFzcyBuYW1lc1xuICAgICAgICAgICAgLy8gYmVmb3JlIHBhc3RpbmcgdGhlbSBpbnRvIHRoZSBUUyBvdXRwdXQuIGBNeS5Gb29gIGV0Yy5cbiAgICAgICAgICAgIC8vIHdvdWxkIGJlIGludmFsaWQgVFMgb3RoZXJ3aXNlLlxuICAgICAgICAgICAgY29uc3Qgc3RyaXBwZWRUeXBlID0gc2FuaXRpemVUc05hbWUocmF3VHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykpIHx8ICd1bmtub3duJztcbiAgICAgICAgICAgIGNvbnN0IGV4dGVuZHNMaXN0OiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoZW50cnkuZXh0ZW5kcykgPyBlbnRyeS5leHRlbmRzIDogW107XG4gICAgICAgICAgICBjb25zdCBpc1JlZmVyZW5jZSA9IGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5PYmplY3QnKVxuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdOb2RlJ1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdDb21wb25lbnQnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLk5vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLkNvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xuICAgICAgICAgICAgdHMgPSBpc1JlZmVyZW5jZSA/IGBJbnN0YW5jZVJlZmVyZW5jZTwke3N0cmlwcGVkVHlwZX0+YCA6IHN0cmlwcGVkVHlwZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHM7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclByb3BlcnR5RGVjb3JhdG9yKGVudHJ5OiBhbnksIHJlc29sdmVkVHlwZT86IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCB0eXBlRXhwciA9IHJlc29sdmVkVHlwZSA/PyBkZWNvcmF0b3JUeXBlRXhwcmVzc2lvbihlbnRyeSk7XG4gICAgY29uc3QgaGFzRW51bU9yQml0bWFza0xpc3QgPSBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeSkgIT09IG51bGxcbiAgICAgICAgfHwgZW51bU9yQml0bWFza0xpc3QoYXJyYXlJdGVtRW50cnkoZW50cnkpKSAhPT0gbnVsbDtcbiAgICBpZiAoKGVudHJ5LnR5cGUgIT09IHVuZGVmaW5lZCB8fCBoYXNFbnVtT3JCaXRtYXNrTGlzdCkgJiYgdHlwZUV4cHIpIHtcbiAgICAgICAgcGFydHMucHVzaChgdHlwZTogJHt0eXBlRXhwcn1gKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGF0dHIgb2YgWydtaW4nLCAnbWF4JywgJ3N0ZXAnLCAndW5pdCcsICdyYWRpYW4nLCAnbXVsdGlsaW5lJywgJ3Rvb2x0aXAnXSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGVudHJ5W2F0dHJdO1xuICAgICAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcGFydHMucHVzaChgJHthdHRyfTogJHtkZWNvcmF0b3JWYWx1ZSh2YWx1ZSl9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGFydHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gYEBwcm9wZXJ0eSh7ICR7cGFydHMuam9pbignLCAnKX0gfSlgO1xufVxuXG5mdW5jdGlvbiBkZWNvcmF0b3JUeXBlRXhwcmVzc2lvbihlbnRyeTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnk/LmlzQXJyYXk7XG4gICAgY29uc3QgaXRlbUVudHJ5ID0gaXNBcnJheSA/IGFycmF5SXRlbUVudHJ5KGVudHJ5KSA6IGVudHJ5O1xuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGl0ZW1FbnRyeT8udHlwZTtcbiAgICBpZiAoIXJhd1R5cGUpIHJldHVybiBudWxsO1xuXG4gICAgbGV0IGV4cHI6IHN0cmluZyB8IG51bGw7XG4gICAgc3dpdGNoIChyYXdUeXBlKSB7XG4gICAgICAgIGNhc2UgJ0ludGVnZXInOiBleHByID0gJ0NDSW50ZWdlcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdGbG9hdCc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6IGV4cHIgPSAnQ0NGbG9hdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdTdHJpbmcnOiBleHByID0gJ1N0cmluZyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdCb29sZWFuJzogZXhwciA9ICdCb29sZWFuJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogZXhwciA9ICdOdW1iZXInOyBicmVhaztcbiAgICAgICAgZGVmYXVsdDogZXhwciA9IHNhbml0aXplVHNOYW1lKHJhd1R5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbiAgICB9XG4gICAgaWYgKCFleHByKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gaXNBcnJheSA/IGBbJHtleHByfV1gIDogZXhwcjtcbn1cblxuZnVuY3Rpb24gZGVjb3JhdG9yVmFsdWUodmFsdWU6IGFueSk6IHN0cmluZyB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGFycmF5SXRlbUVudHJ5KGVudHJ5OiBhbnkpOiBhbnkge1xuICAgIGlmIChlbnRyeT8uZWxlbWVudFR5cGVEYXRhKSByZXR1cm4gZW50cnkuZWxlbWVudFR5cGVEYXRhO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudHJ5Py52YWx1ZSkgJiYgZW50cnkudmFsdWUubGVuZ3RoID4gMCkgcmV0dXJuIGVudHJ5LnZhbHVlWzBdO1xuICAgIHJldHVybiBlbnRyeTtcbn1cblxuZnVuY3Rpb24gZW51bU9yQml0bWFza0xpc3QoZW50cnk6IGFueSk6IGFueVtdIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShlbnRyeS5lbnVtTGlzdCkgPyBlbnRyeS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnkuYml0bWFza0xpc3QpID8gZW50cnkuYml0bWFza0xpc3RcbiAgICAgICAgOiBBcnJheS5pc0FycmF5KGVudHJ5Py51c2VyRGF0YT8uZW51bUxpc3QpID8gZW50cnkudXNlckRhdGEuZW51bUxpc3RcbiAgICAgICAgOiBBcnJheS5pc0FycmF5KGVudHJ5Py51c2VyRGF0YT8uYml0bWFza0xpc3QpID8gZW50cnkudXNlckRhdGEuYml0bWFza0xpc3RcbiAgICAgICAgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnN0RW51bURlZmluaXRpb24oY3R4OiBSZW5kZXJDb250ZXh0LCBlbnVtTmFtZTogc3RyaW5nLCBpdGVtczogYW55W10pOiB2b2lkIHtcbiAgICBjb25zdCBzYWZlRW51bU5hbWUgPSBzYW5pdGl6ZVRzTmFtZShlbnVtTmFtZSk7XG4gICAgaWYgKGN0eC5kZWZpbmVkTmFtZXMuaGFzKHNhZmVFbnVtTmFtZSkpIHJldHVybjtcbiAgICBjdHguZGVmaW5lZE5hbWVzLmFkZChzYWZlRW51bU5hbWUpO1xuXG4gICAgY29uc3QgdXNlZE1lbWJlck5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2Bjb25zdCBlbnVtICR7c2FmZUVudW1OYW1lfSB7YF07XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3QgcmF3TmFtZSA9IGl0ZW0/Lm5hbWUgPz8gaXRlbT8uZGlzcGxheU5hbWUgPz8gaXRlbT8udmFsdWUgPz8gYFZhbHVlJHtpbmRleH1gO1xuICAgICAgICBsZXQgbWVtYmVyTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyhyYXdOYW1lKSk7XG4gICAgICAgIGlmICh1c2VkTWVtYmVyTmFtZXMuaGFzKG1lbWJlck5hbWUpKSB7XG4gICAgICAgICAgICBtZW1iZXJOYW1lID0gYCR7bWVtYmVyTmFtZX1fJHtpbmRleH1gO1xuICAgICAgICB9XG4gICAgICAgIHVzZWRNZW1iZXJOYW1lcy5hZGQobWVtYmVyTmFtZSk7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gaXRlbT8udmFsdWU7XG4gICAgICAgIGNvbnN0IGluaXRpYWxpemVyID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSlcbiAgICAgICAgICAgIDogdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJ1xuICAgICAgICAgICAgICAgID8gU3RyaW5nKHZhbHVlKVxuICAgICAgICAgICAgICAgIDogU3RyaW5nKGluZGV4KTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICR7bWVtYmVyTmFtZX0gPSAke2luaXRpYWxpemVyfSxgKTtcbiAgICB9KTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgY3R4LmRlZmluaXRpb25zLnB1c2gobGluZXMuam9pbignXFxuJykpO1xufVxuXG5mdW5jdGlvbiBuZXN0ZWRTdHJ1Y3RWYWx1ZShlbnRyeTogYW55KTogYW55IHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB2YWx1ZSA9IGVudHJ5LnZhbHVlO1xuICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSAmJiAnX190eXBlX18nIGluIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgaWYgKCdfX3R5cGVfXycgaW4gZW50cnkgJiYgISgndHlwZScgaW4gZW50cnkpKSB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIG5lc3RlZFN0cnVjdENsYXNzTmFtZShvd25lckNsYXNzTmFtZTogc3RyaW5nLCBwcm9wTmFtZTogc3RyaW5nLCB2YWx1ZTogYW55LCBpc0FycmF5OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCB0eXBlTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyh2YWx1ZT8uX190eXBlX18gPz8gJycpLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgaWYgKHR5cGVOYW1lICYmIHR5cGVOYW1lICE9PSAnX1Vua25vd24nICYmIHR5cGVOYW1lICE9PSAnT2JqZWN0Jykge1xuICAgICAgICByZXR1cm4gdHlwZU5hbWU7XG4gICAgfVxuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShgJHtvd25lckNsYXNzTmFtZX0ke3Bhc2NhbENhc2VOYW1lKHByb3BOYW1lKX0ke2lzQXJyYXkgPyAnSXRlbScgOiAnVHlwZSd9YCk7XG59XG5cbmZ1bmN0aW9uIGlzQ29tbW9uVmFsdWVUeXBlKHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlID09PSAnY2MuVmVjMidcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlZlYzMnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5WZWM0J1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuQ29sb3InXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5SZWN0J1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuU2l6ZSdcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlF1YXQnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5NYXQzJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuTWF0NCc7XG59XG5cbmZ1bmN0aW9uIGlzUmVmZXJlbmNlRW50cnkoZW50cnk6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG4gICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICByZXR1cm4gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdOb2RlJ1xuICAgICAgICB8fCByYXdUeXBlID09PSAnQ29tcG9uZW50J1xuICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLkNvbXBvbmVudCdcbiAgICAgICAgfHwgKHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJykgJiYgIWlzQ29tbW9uVmFsdWVUeXBlKHJhd1R5cGUpKTtcbn1cblxuZnVuY3Rpb24gcGFzY2FsQ2FzZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB3b3JkcyA9IFN0cmluZyhuYW1lID8/ICcnKVxuICAgICAgICAucmVwbGFjZSgvKFthLXowLTldKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgLnNwbGl0KC9bXkEtWmEtejAtOV0rLylcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICBjb25zdCBwYXNjYWwgPSB3b3Jkcy5tYXAoKHdvcmQpID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKS5qb2luKCcnKTtcbiAgICByZXR1cm4gc2FuaXRpemVUc05hbWUocGFzY2FsIHx8IG5hbWUgfHwgJ1ZhbHVlJyk7XG59XG5cbmZ1bmN0aW9uIGlzQ29tcG9uZW50RHVtcChkdW1wOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIWR1bXAgfHwgdHlwZW9mIGR1bXAgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VHlwZSA9IFN0cmluZyhkdW1wLl9fdHlwZV9fID8/IGR1bXAudHlwZSA/PyAnJyk7XG4gICAgaWYgKHJhd1R5cGUgPT09ICdOb2RlJyB8fCByYXdUeXBlID09PSAnY2MuTm9kZScpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGR1bXAuZXh0ZW5kcykgPyBkdW1wLmV4dGVuZHMgOiBbXTtcbiAgICByZXR1cm4gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLkNvbXBvbmVudCcpIHx8ICFBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKTtcbn1cblxuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4KTogdGhlIHYyLjQuMSBpbXBsZW1lbnRhdGlvbiBvbmx5IHN0cmlwcGVkXG4vLyBub24taWRlbnRpZmllciBjaGFyYWN0ZXJzIGJ1dCBkaWRuJ3QgZ3VhcmQgYWdhaW5zdCBhIGRpZ2l0LWxlYWRpbmdcbi8vIHJlc3VsdCAoYGNsYXNzIDJkU3ByaXRlYCkgb3IgYW4gZW1wdHkgcmVzdWx0IChhZnRlciBzdHJpcHBpbmcgYWxsXG4vLyBjaGFycyBpbiBhIFVVSUQtc2hhcGVkIF9fdHlwZV9fKS4gQm90aCBwcm9kdWNlIGludmFsaWQgVFMuIFByZWZpeFxuLy8gZGlnaXQtbGVhZGluZyBhbmQgZW1wdHkgY2FzZXMgd2l0aCBgX2AgLyBgX1Vua25vd25gLlxuZnVuY3Rpb24gc2FuaXRpemVUc05hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBjbGVhbmVkID0gU3RyaW5nKG5hbWUgPz8gJycpLnJlcGxhY2UoL1teYS16QS1aMC05X10vZywgJ18nKTtcbiAgICBpZiAoY2xlYW5lZC5sZW5ndGggPT09IDApIHJldHVybiAnX1Vua25vd24nO1xuICAgIGlmICgvXlswLTldLy50ZXN0KGNsZWFuZWQpKSByZXR1cm4gYF8ke2NsZWFuZWR9YDtcbiAgICByZXR1cm4gY2xlYW5lZDtcbn1cbiJdfQ==