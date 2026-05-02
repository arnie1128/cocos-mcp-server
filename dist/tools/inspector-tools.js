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
const asset_meta_tools_1 = require("./asset-meta-tools");
const component_tools_1 = require("./component-tools");
const node_tools_1 = require("./node-tools");
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
        this.assetMetaTools = new asset_meta_tools_1.AssetMetaTools();
        this.componentTools = new component_tools_1.ComponentTools();
        this.nodeTools = new node_tools_1.NodeTools();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getCommonTypesDefinition() {
        return (0, response_1.ok)({ definition: COMMON_TYPES_DEFINITION });
    }
    async getInstanceDefinition(args) {
        var _a, _b, _c, _d, _e;
        const { reference } = args;
        if (!(reference === null || reference === void 0 ? void 0 : reference.id)) {
            return (0, response_1.fail)('inspector_get_instance_definition: reference.id is required');
        }
        const assetInfoResult = await queryAssetInfo(reference.id);
        if (assetInfoResult.assetInfo || isAssetReferenceHint(reference)) {
            if (!assetInfoResult.assetInfo) {
                return (0, response_1.fail)((_a = assetInfoResult.error) !== null && _a !== void 0 ? _a : `inspector: asset not found for ${reference.id}.`);
            }
            return this.getAssetInstanceDefinition(reference, assetInfoResult.assetInfo);
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
            const dumpType = String((_c = (_b = dump.__type__) !== null && _b !== void 0 ? _b : dump.type) !== null && _c !== void 0 ? _c : 'CocosInstance');
            const className = dumpType.replace(/^cc\./, '');
            const referenceTypeMismatch = reference.type
                && reference.type !== dumpType
                && reference.type.replace(/^cc\./, '') !== className;
            const ts = renderTsClass(className, dump, isComponentDump(dump));
            const response = {
                success: true,
                data: {
                    reference: { id: reference.id, type: (_d = dump.__type__) !== null && _d !== void 0 ? _d : reference.type },
                    kind: isComponentDump(dump) ? 'component' : 'node',
                    definition: ts,
                },
            };
            if (referenceTypeMismatch) {
                response.warning = `inspector: reference.type (${reference.type}) does not match dump __type__ (${dumpType}); class label uses the dump value`;
            }
            return response;
        }
        catch (err) {
            return (0, response_1.fail)(`inspector: query-node failed: ${(_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err)}`);
        }
    }
    async getAssetInstanceDefinition(reference, assetInfo) {
        var _a, _b, _c, _d, _e;
        const resp = await this.assetMetaTools.execute('get_properties', {
            reference,
            includeTooltips: true,
            useAdvancedInspection: false,
        });
        if (!resp.success)
            return resp;
        const className = `${assetClassName(assetInfo, reference)}Importer`;
        const ts = renderAssetImporterClass(className, (_b = (_a = resp.data) === null || _a === void 0 ? void 0 : _a.properties) !== null && _b !== void 0 ? _b : {}, (_d = (_c = resp.data) === null || _c === void 0 ? void 0 : _c.arrays) !== null && _d !== void 0 ? _d : {});
        return (0, response_1.ok)({
            reference: { id: reference.id, type: (_e = reference.type) !== null && _e !== void 0 ? _e : assetInfo.type },
            kind: 'asset',
            importer: assetInfo.importer,
            definition: ts,
        });
    }
    async getSettingsDefinition(args) {
        switch (args.settingsType) {
            case 'CommonTypes':
                return (0, response_1.ok)({ definition: COMMON_TYPES_DEFINITION });
            case 'CurrentSceneGlobals':
                return (0, response_1.fail)('settings introspection for CurrentSceneGlobals not yet wired — pending cocos channel research.');
            case 'ProjectSettings':
                return (0, response_1.fail)('ProjectSettings introspection not yet wired — pending cocos channel research.');
            default:
                return (0, response_1.fail)(`Unknown settingsType: ${args.settingsType}`);
        }
    }
    async setInstanceProperties(args) {
        var _a;
        const { reference, properties } = args;
        if (!(reference === null || reference === void 0 ? void 0 : reference.id))
            return (0, response_1.fail)('inspector_set_instance_properties: reference.id is required');
        const assetInfoResult = await queryAssetInfo(reference.id);
        if (assetInfoResult.assetInfo || isAssetReferenceHint(reference)) {
            if (!assetInfoResult.assetInfo) {
                return (0, response_1.fail)((_a = assetInfoResult.error) !== null && _a !== void 0 ? _a : `inspector: asset not found for ${reference.id}.`);
            }
            const resp = await this.assetMetaTools.execute('set_properties', {
                reference,
                properties: properties.map(p => ({
                    propertyPath: p.path,
                    propertyType: p.type,
                    propertyValue: p.value,
                })),
            });
            return normalizeDelegatedBatchResponse(resp, 'asset', properties);
        }
        if (isNodeReference(reference)) {
            const resp = await this.nodeTools.execute('set_node_properties', {
                reference,
                properties: properties.map(p => ({ path: p.path, value: p.value })),
            });
            return normalizeDelegatedBatchResponse(resp, 'node', properties);
        }
        const componentTarget = await resolveComponentTarget(reference);
        if ('error' in componentTarget)
            return (0, response_1.fail)(componentTarget.error);
        const resp = await this.componentTools.execute('set_component_properties', {
            nodeUuid: componentTarget.nodeUuid,
            componentType: componentTarget.componentType,
            properties: properties.map(p => ({
                property: p.path,
                propertyType: p.type,
                value: p.value,
            })),
        });
        return normalizeDelegatedBatchResponse(resp, 'component', properties);
    }
}
exports.InspectorTools = InspectorTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_common_types_definition',
        title: 'Read cocos common types',
        description: '[specialist] Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: schema_1.z.object({}),
    })
], InspectorTools.prototype, "getCommonTypesDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_instance_definition',
        title: 'Read instance TS definition',
        description: '[specialist] Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.describe('Target node or component. {id} = instance UUID, {type} optional cc class label.'),
        }),
    })
], InspectorTools.prototype, "getInstanceDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_settings_definition',
        title: 'Read settings TS definition',
        description: '[specialist] Generate a TypeScript class declaration for editor settings dumps. settingsType selects which dump: CommonTypes returns the common cocos value types; CurrentSceneGlobals dumps current scene globals; ProjectSettings dumps cocos project settings categories.',
        inputSchema: schema_1.z.object({
            settingsType: schema_1.z.enum(['CommonTypes', 'CurrentSceneGlobals', 'ProjectSettings']).describe('Which settings dump to render.'),
        }),
    })
], InspectorTools.prototype, "getSettingsDefinition", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_instance_properties',
        title: 'Set instance properties (generic)',
        description: '[specialist] Generic batch property writer that dispatches to the right setter based on instance kind. reference.type prefix routes: asset:* → assetMeta path (interpreter-validated); cc.Component / component cid → component path; cc.Node → node path. For single-kind work, the specific tools (component_set_component_property / assetMeta_set_properties / node_set_node_property) are still preferred; use this for heterogeneous batches. Note: kind-specific options like preserveContentSize are not available here — use the dedicated tools for those.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema,
            properties: schema_1.z.array(schema_1.z.object({
                path: schema_1.z.string(),
                type: schema_1.z.string(),
                value: schema_1.z.any(),
            })).min(1).max(50),
        }),
    })
], InspectorTools.prototype, "setInstanceProperties", null);
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
function renderAssetImporterClass(className, properties, arrays) {
    const ctx = { definitions: [], definedNames: new Set() };
    const lines = [`class ${sanitizeTsName(className)} {`];
    const paths = new Set([...Object.keys(properties), ...Object.keys(arrays !== null && arrays !== void 0 ? arrays : {})]);
    for (const path of [...paths].sort()) {
        const entry = properties[path];
        const tooltip = resolveI18nText(entry === null || entry === void 0 ? void 0 : entry.tooltip);
        if (tooltip && typeof tooltip === 'string') {
            lines.push(`    /** ${sanitizeForComment(tooltip)} */`);
        }
        const enumList = enumOrBitmaskList(entry);
        let tsType;
        let decoratorType;
        if (enumList) {
            const enumName = pascalCaseName(path);
            generateConstEnumDefinition(ctx, enumName, enumList);
            tsType = enumName;
            decoratorType = enumName;
        }
        else {
            tsType = resolveTsType(entry !== null && entry !== void 0 ? entry : arrays[path]);
        }
        if (arrays && Object.prototype.hasOwnProperty.call(arrays, path)) {
            tsType = `Array<${tsType}>`;
            if (decoratorType)
                decoratorType = `[${decoratorType}]`;
        }
        const decorator = renderPropertyDecorator(entry, decoratorType);
        if (decorator) {
            lines.push(`    ${decorator}`);
        }
        lines.push(`    ${renderPathAsProperty(path)}: ${tsType};`);
    }
    lines.push('}');
    return [...ctx.definitions, lines.join('\n')].join('\n\n');
}
function renderPathAsProperty(path) {
    return isSafeTsIdentifier(path) ? path : JSON.stringify(path);
}
async function queryAssetInfo(id) {
    var _a;
    try {
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', id);
        return assetInfo ? { assetInfo } : {};
    }
    catch (err) {
        return { error: `query-asset-info failed for ${id}: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}` };
    }
}
function isAssetReferenceHint(reference) {
    return typeof reference.type === 'string' && reference.type.startsWith('asset:');
}
function isNodeReference(reference) {
    const t = reference.type;
    return !t || t === 'node' || t === 'Node' || t === 'cc.Node';
}
function assetClassName(assetInfo, reference) {
    var _a;
    const raw = String(((_a = reference.type) === null || _a === void 0 ? void 0 : _a.replace(/^asset:/, '')) || assetInfo.type || assetInfo.importer || 'Asset');
    return sanitizeTsName(raw.replace(/^cc\./, ''));
}
async function resolveComponentTarget(reference) {
    const found = await findComponentInScene(reference.id);
    if (found)
        return found;
    if (reference.type && !isNodeReference(reference) && !isAssetReferenceHint(reference)) {
        try {
            const dump = await Editor.Message.request('scene', 'query-node', reference.id);
            if (dump && Array.isArray(dump.__comps__)) {
                return { nodeUuid: reference.id, componentType: reference.type };
            }
        }
        catch (_a) {
            // Return the component lookup failure below.
        }
    }
    return { error: `inspector_set_instance_properties: could not resolve component reference ${reference.id}. Pass reference.id as a component UUID with reference.type as the component cid/type, or use cc.Node for node properties.` };
}
async function findComponentInScene(componentUuid) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const queue = Array.isArray(tree) ? [...tree] : [tree];
        while (queue.length > 0) {
            const item = queue.shift();
            const nodeUuid = (_b = (_a = item === null || item === void 0 ? void 0 : item.uuid) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : item === null || item === void 0 ? void 0 : item.uuid;
            if (!nodeUuid)
                continue;
            try {
                const dump = await Editor.Message.request('scene', 'query-node', nodeUuid);
                const comps = Array.isArray(dump === null || dump === void 0 ? void 0 : dump.__comps__) ? dump.__comps__ : [];
                for (const comp of comps) {
                    const uuid = (_g = (_e = (_d = (_c = comp === null || comp === void 0 ? void 0 : comp.value) === null || _c === void 0 ? void 0 : _c.uuid) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : (_f = comp === null || comp === void 0 ? void 0 : comp.uuid) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : comp === null || comp === void 0 ? void 0 : comp.uuid;
                    if (uuid === componentUuid) {
                        return {
                            nodeUuid,
                            componentType: String((_k = (_j = (_h = comp === null || comp === void 0 ? void 0 : comp.__type__) !== null && _h !== void 0 ? _h : comp === null || comp === void 0 ? void 0 : comp.cid) !== null && _j !== void 0 ? _j : comp === null || comp === void 0 ? void 0 : comp.type) !== null && _k !== void 0 ? _k : 'cc.Component'),
                        };
                    }
                }
            }
            catch (_l) {
                // Keep scanning other nodes.
            }
            if (Array.isArray(item === null || item === void 0 ? void 0 : item.children))
                queue.push(...item.children);
        }
    }
    catch (_m) {
        return null;
    }
    return null;
}
function normalizeDelegatedBatchResponse(resp, kind, requested) {
    var _a, _b, _c;
    const rawResults = Array.isArray((_a = resp.data) === null || _a === void 0 ? void 0 : _a.results) ? resp.data.results : null;
    const results = rawResults
        ? rawResults.map((r, i) => {
            var _a, _b, _c, _d, _e;
            return ({
                path: (_c = (_b = (_a = r.path) !== null && _a !== void 0 ? _a : r.property) !== null && _b !== void 0 ? _b : r.propertyPath) !== null && _c !== void 0 ? _c : (_d = requested[i]) === null || _d === void 0 ? void 0 : _d.path,
                success: !!r.success,
                error: r.success ? undefined : ((_e = r.error) !== null && _e !== void 0 ? _e : 'unknown'),
                warning: r.warning,
            });
        })
        : requested.map(p => {
            var _a, _b;
            return ({
                path: p.path,
                success: !!resp.success,
                error: resp.success ? undefined : ((_b = (_a = resp.error) !== null && _a !== void 0 ? _a : resp.message) !== null && _b !== void 0 ? _b : 'unknown'),
            });
        });
    const failedCount = results.filter((r) => !r.success).length;
    const response = {
        success: results.some((r) => r.success),
        data: {
            kind,
            total: results.length,
            failedCount,
            results,
            delegated: resp.data,
        },
        message: failedCount === 0
            ? `Wrote ${results.length} ${kind} properties`
            : `${failedCount}/${results.length} ${kind} property writes failed`,
    };
    if (resp.warning)
        response.warning = resp.warning;
    if (!response.success)
        response.error = (_c = (_b = resp.error) !== null && _b !== void 0 ? _b : resp.message) !== null && _c !== void 0 ? _c : response.message;
    return response;
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
            const tooltip = resolveI18nText(tooltipSrc);
            if (tooltip && typeof tooltip === 'string') {
                lines.push(`    /** ${sanitizeForComment(tooltip)} */`);
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
            parts.push(`${attr}: ${decoratorValue(attr === 'tooltip' || attr === 'displayName' ? resolveI18nText(value) : value)}`);
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
function resolveI18nText(value) {
    if (typeof value !== 'string' || !value.startsWith('i18n:'))
        return value;
    try {
        const translated = Editor.I18n.t(value.slice(5));
        if (typeof translated === 'string' && translated.trim().length > 0) {
            return translated;
        }
    }
    catch (_a) {
        // Keep original i18n key when editor localization is unavailable.
    }
    return value;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBQ3ZGLHlEQUFvRDtBQUNwRCx1REFBbUQ7QUFDbkQsNkNBQXlDO0FBRXpDLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsbUVBQW1FO0FBQ25FLHNFQUFzRTtBQUN0RSw4QkFBOEI7QUFDOUIsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUNwQyxVQUFVLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxrQkFBa0I7SUFDekQsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNO0lBQzFCLFVBQVUsRUFBRSxRQUFRO0lBQ3BCLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsaUJBQWlCO0lBQzlELG1CQUFtQixFQUFFLGFBQWE7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsTUFBYSxjQUFjO0lBTXZCO1FBSmlCLG1CQUFjLEdBQUcsSUFBSSxpQ0FBYyxFQUFFLENBQUM7UUFDdEMsbUJBQWMsR0FBRyxJQUFJLGdDQUFjLEVBQUUsQ0FBQztRQUN0QyxjQUFTLEdBQUcsSUFBSSxzQkFBUyxFQUFFLENBQUM7UUFHekMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0Qs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LEdBQUcsTUFBTSxDQUFDLE1BQUEsTUFBQSxJQUFJLENBQUMsUUFBUSxtQ0FBSSxJQUFJLENBQUMsSUFBSSxtQ0FBSSxFQUFFLENBQUMsQ0FBQztJQUN6RCxJQUFJLE9BQU8sS0FBSyxNQUFNLElBQUksT0FBTyxLQUFLLFNBQVM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUM5RCxNQUFNLFdBQVcsR0FBYSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzlFLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRCxxRUFBcUU7QUFDckUscUVBQXFFO0FBQ3JFLG9FQUFvRTtBQUNwRSxvRUFBb0U7QUFDcEUsdURBQXVEO0FBQ3ZELFNBQVMsY0FBYyxDQUFDLElBQVk7SUFDaEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksYUFBSixJQUFJLGNBQUosSUFBSSxHQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNsRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sVUFBVSxDQUFDO0lBQzVDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7UUFBRSxPQUFPLElBQUksT0FBTyxFQUFFLENBQUM7SUFDakQsT0FBTyxPQUFPLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogaW5zcGVjdG9yLXRvb2xzIOKAlCBUeXBlU2NyaXB0IGNsYXNzLWRlZmluaXRpb24gZ2VuZXJhdG9yIGJhY2tlZCBieVxuICogY29jb3MgYHNjZW5lL3F1ZXJ5LW5vZGVgIGR1bXBzLlxuICpcbiAqIFR3byBNQ1AgdG9vbHM6XG4gKiAgIC0gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uICDigJQgZm9yIGEgKipub2RlKiogb3JcbiAqICAgICBjb21wb25lbnQgcmVmZXJlbmNlLCB3YWxrIHRoZSBjb2NvcyBkdW1wIGFuZCBlbWl0IGEgVHlwZVNjcmlwdFxuICogICAgIGNsYXNzIGRlY2xhcmF0aW9uIEFJIGNhbiByZWFkIGJlZm9yZSBjaGFuZ2luZyBwcm9wZXJ0aWVzLiBBdm9pZHNcbiAqICAgICB0aGUgXCJBSSBndWVzc2VzIHByb3BlcnR5IG5hbWVcIiBmYWlsdXJlIG1vZGUuXG4gKiAgIC0gaW5zcGVjdG9yX2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiDigJQgcmV0dXJuIGhhcmRjb2RlZFxuICogICAgIGRlZmluaXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBldGMuKVxuICogICAgIHRoYXQgdGhlIGluc3RhbmNlIGRlZmluaXRpb24gcmVmZXJlbmNlcyBidXQgZG9lc24ndCBpbmxpbmUuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdilcbiAqIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGUvc291cmNlL3V0Y3AvdG9vbHMvdHlwZXNjcmlwdC1kZWZlbml0aW9uLnRzYC5cbiAqIE91ciBpbXBsIHdhbGtzIHByb3BlcnR5IGR1bXBzLCBkZWNvcmF0b3JzLCBlbnVtL0JpdE1hc2sgbWV0YWRhdGEsXG4gKiBuZXN0ZWQgc3RydWN0cywgYXJyYXlzLCBhbmQgcmVmZXJlbmNlcy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIEBtY3BUb29sIGRlY29yYXRvciAodjIuNC4wIHN0ZXAgNSkuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuaW1wb3J0IHsgQXNzZXRNZXRhVG9vbHMgfSBmcm9tICcuL2Fzc2V0LW1ldGEtdG9vbHMnO1xuaW1wb3J0IHsgQ29tcG9uZW50VG9vbHMgfSBmcm9tICcuL2NvbXBvbmVudC10b29scyc7XG5pbXBvcnQgeyBOb2RlVG9vbHMgfSBmcm9tICcuL25vZGUtdG9vbHMnO1xuXG5jb25zdCBDT01NT05fVFlQRVNfREVGSU5JVElPTiA9IGAvLyBDb2NvcyBjb21tb24gdmFsdWUgdHlwZXMg4oCUIHJlZmVyZW5jZWQgYnkgaW5zdGFuY2UgZGVmaW5pdGlvbnMuXG50eXBlIEluc3RhbmNlUmVmZXJlbmNlPFQgPSB1bmtub3duPiA9IHsgaWQ6IHN0cmluZzsgdHlwZT86IHN0cmluZyB9O1xuY2xhc3MgVmVjMiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB9XG5jbGFzcyBWZWMzIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfVxuY2xhc3MgVmVjNCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgQ29sb3IgeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXI7IH1cbmNsYXNzIFJlY3QgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFNpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgUXVhdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgTWF0MyB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7XG4gIG0wMzogbnVtYmVyOyBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7XG4gIG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjsgbTA4OiBudW1iZXI7IH1cbmNsYXNzIE1hdDQgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyOyBtMDM6IG51bWJlcjtcbiAgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyOyBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7XG4gIG0wODogbnVtYmVyOyBtMDk6IG51bWJlcjsgbTEwOiBudW1iZXI7IG0xMTogbnVtYmVyO1xuICBtMTI6IG51bWJlcjsgbTEzOiBudW1iZXI7IG0xNDogbnVtYmVyOyBtMTU6IG51bWJlcjsgfVxuYDtcblxuLy8gTmFtZXMgdGhhdCBzaG93IHVwIGF0IHRoZSB0b3Agb2YgZXZlcnkgbm9kZSBkdW1wIGJ1dCBhcmVuJ3Rcbi8vIHVzZXItZmFjaW5nIHByb3BlcnRpZXM7IHN1cHByZXNzIGZyb20gZ2VuZXJhdGVkIGRlZmluaXRpb25zLlxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNvZGV4KTogZXhwYW5kZWQgZnJvbSB0aGUgdjIuNC4wIG1pbmltYWwgbGlzdCB0b1xuLy8gY292ZXIgcHJlZmFiLWluc3RhbmNlL3NlcmlhbGl6YXRpb24gbWV0YWRhdGEgYW5kIGVkaXRvci1vbmx5IGZpZWxkc1xuLy8gdGhhdCBBSSBzaG91bGRuJ3QgdHJ5IHRvIG11dGF0ZS5cbi8vXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgrY2xhdWRlK2dlbWluaSk6IENPTVBPTkVOVF9JTlRFUk5BTF9LRVlTIHdhc1xuLy8gcmVtb3ZlZCBhZnRlciBkcmlmdGluZyBvdXQgb2Ygc3luYyB3aXRoIGNvY29zIGVkaXRvci4gVGhlIHNoYXJlZFxuLy8gcmVuZGVyZXIga2VlcHMgdGhpcyBjb25zZXJ2YXRpdmUgbm9kZSBtZXRhZGF0YSBmaWx0ZXIgZm9yIGJvdGggbm9kZVxuLy8gYW5kIGNvbXBvbmVudC1zaGFwZWQgZHVtcHMuXG5jb25zdCBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX2NvbXBzX18nLCAnX19wcmVmYWJfXycsICdfX2VkaXRvckV4dHJhc19fJyxcbiAgICAnX29iakZsYWdzJywgJ19pZCcsICd1dWlkJyxcbiAgICAnY2hpbGRyZW4nLCAncGFyZW50JyxcbiAgICAnX3ByZWZhYkluc3RhbmNlJywgJ19wcmVmYWInLCAnbW91bnRlZFJvb3QnLCAnbW91bnRlZENoaWxkcmVuJyxcbiAgICAncmVtb3ZlZENvbXBvbmVudHMnLCAnX2NvbXBvbmVudHMnLFxuXSk7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBhc3NldE1ldGFUb29scyA9IG5ldyBBc3NldE1ldGFUb29scygpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5vZGVUb29scyA9IG5ldyBOb2RlVG9vbHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBjb2NvcyBjb21tb24gdHlwZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXR1cm4gaGFyZGNvZGVkIFR5cGVTY3JpcHQgZGVjbGFyYXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBTaXplLCBRdWF0LCBNYXQzLzQpIGFuZCB0aGUgSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuIEFJIGNhbiBwcmVwZW5kIHRoaXMgdG8gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uIG91dHB1dCBiZWZvcmUgZ2VuZXJhdGluZyB0eXBlLXNhZmUgY29kZS4gTm8gc2NlbmUgcXVlcnkuIFN1cHBvcnRzIGJvdGggbm9kZSBhbmQgY29tcG9uZW50IGluc3RhbmNlIGR1bXBzIGluY2x1ZGluZyBAcHJvcGVydHkgZGVjb3JhdG9ycyBhbmQgZW51bSB0eXBlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Q29tbW9uVHlwZXNEZWZpbml0aW9uKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBvayh7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9pbnN0YW5jZV9kZWZpbml0aW9uJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGluc3RhbmNlIFRTIGRlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGEgc2NlbmUgbm9kZSwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHNjZW5lL3F1ZXJ5LW5vZGUgZHVtcC4gVGhlIGdlbmVyYXRlZCBjbGFzcyBpbmNsdWRlcyBhIGNvbW1lbnQgbGlzdGluZyB0aGUgY29tcG9uZW50cyBhdHRhY2hlZCB0byB0aGUgbm9kZSAod2l0aCBVVUlEcykuIEFJIHNob3VsZCBjYWxsIHRoaXMgQkVGT1JFIHdyaXRpbmcgcHJvcGVydGllcyBzbyBpdCBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciB3aXRoIGdldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiBmb3IgVmVjMi9Db2xvci9ldGMgcmVmZXJlbmNlcy4gU3VwcG9ydHMgYm90aCBub2RlIGFuZCBjb21wb25lbnQgaW5zdGFuY2UgZHVtcHMgaW5jbHVkaW5nIEBwcm9wZXJ0eSBkZWNvcmF0b3JzIGFuZCBlbnVtIHR5cGVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBvciBjb21wb25lbnQuIHtpZH0gPSBpbnN0YW5jZSBVVUlELCB7dHlwZX0gb3B0aW9uYWwgY2MgY2xhc3MgbGFiZWwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0SW5zdGFuY2VEZWZpbml0aW9uKGFyZ3M6IHsgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXNzZXRJbmZvUmVzdWx0ID0gYXdhaXQgcXVlcnlBc3NldEluZm8ocmVmZXJlbmNlLmlkKTtcbiAgICAgICAgaWYgKGFzc2V0SW5mb1Jlc3VsdC5hc3NldEluZm8gfHwgaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlKSkge1xuICAgICAgICAgICAgaWYgKCFhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYXNzZXRJbmZvUmVzdWx0LmVycm9yID8/IGBpbnNwZWN0b3I6IGFzc2V0IG5vdCBmb3VuZCBmb3IgJHtyZWZlcmVuY2UuaWR9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0QXNzZXRJbnN0YW5jZURlZmluaXRpb24ocmVmZXJlbmNlLCBhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZHVtcDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHJlZmVyZW5jZS5pZCk7XG4gICAgICAgICAgICBpZiAoIWR1bXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgaW5zcGVjdG9yOiBxdWVyeS1ub2RlIHJldHVybmVkIG5vIGR1bXAgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjQuMiByZXZpZXcgZml4IChjb2RleCk6IHRydXN0IHRoZSBkdW1wJ3MgX190eXBlX18sIG5vdFxuICAgICAgICAgICAgLy8gdGhlIGNhbGxlci1zdXBwbGllZCByZWZlcmVuY2UudHlwZS4gQSBjYWxsZXIgcGFzc2luZ1xuICAgICAgICAgICAgLy8ge2lkOiBub2RlVXVpZCwgdHlwZTogJ2NjLlNwcml0ZSd9IG90aGVyd2lzZSBnb3QgYSBub2RlXG4gICAgICAgICAgICAvLyBkdW1wIHJlbmRlcmVkIGFzIGBjbGFzcyBTcHJpdGVgLCBtaXNsYWJlbGxpbmcgdGhlXG4gICAgICAgICAgICAvLyBkZWNsYXJhdGlvbiBlbnRpcmVseS4gcmVmZXJlbmNlLnR5cGUgaXMgbm93IGRpYWdub3N0aWNcbiAgICAgICAgICAgIC8vIG9ubHkg4oCUIHN1cmZhY2VkIGluIHRoZSByZXNwb25zZSBkYXRhIHNvIGNhbGxlcnMgY2FuIHNlZVxuICAgICAgICAgICAgLy8gYSBtaXNtYXRjaCBidXQgbmV2ZXIgdXNlZCBhcyB0aGUgY2xhc3MgbmFtZS5cbiAgICAgICAgICAgIGNvbnN0IGR1bXBUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICdDb2Nvc0luc3RhbmNlJyk7XG4gICAgICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBkdW1wVHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJyk7XG4gICAgICAgICAgICBjb25zdCByZWZlcmVuY2VUeXBlTWlzbWF0Y2ggPSByZWZlcmVuY2UudHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlICE9PSBkdW1wVHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSAhPT0gY2xhc3NOYW1lO1xuICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZSwgZHVtcCwgaXNDb21wb25lbnREdW1wKGR1bXApKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiBkdW1wLl9fdHlwZV9fID8/IHJlZmVyZW5jZS50eXBlIH0sXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IGlzQ29tcG9uZW50RHVtcChkdW1wKSA/ICdjb21wb25lbnQnIDogJ25vZGUnLFxuICAgICAgICAgICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChyZWZlcmVuY2VUeXBlTWlzbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5nID0gYGluc3BlY3RvcjogcmVmZXJlbmNlLnR5cGUgKCR7cmVmZXJlbmNlLnR5cGV9KSBkb2VzIG5vdCBtYXRjaCBkdW1wIF9fdHlwZV9fICgke2R1bXBUeXBlfSk7IGNsYXNzIGxhYmVsIHVzZXMgdGhlIGR1bXAgdmFsdWVgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGluc3BlY3RvcjogcXVlcnktbm9kZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBc3NldEluc3RhbmNlRGVmaW5pdGlvbihyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlLCBhc3NldEluZm86IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFzc2V0TWV0YVRvb2xzLmV4ZWN1dGUoJ2dldF9wcm9wZXJ0aWVzJywge1xuICAgICAgICAgICAgcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiB0cnVlLFxuICAgICAgICAgICAgdXNlQWR2YW5jZWRJbnNwZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghcmVzcC5zdWNjZXNzKSByZXR1cm4gcmVzcDtcbiAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gYCR7YXNzZXRDbGFzc05hbWUoYXNzZXRJbmZvLCByZWZlcmVuY2UpfUltcG9ydGVyYDtcbiAgICAgICAgY29uc3QgdHMgPSByZW5kZXJBc3NldEltcG9ydGVyQ2xhc3MoY2xhc3NOYW1lLCByZXNwLmRhdGE/LnByb3BlcnRpZXMgPz8ge30sIHJlc3AuZGF0YT8uYXJyYXlzID8/IHt9KTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiByZWZlcmVuY2UudHlwZSA/PyBhc3NldEluZm8udHlwZSB9LFxuICAgICAgICAgICAga2luZDogJ2Fzc2V0JyxcbiAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3NldHRpbmdzX2RlZmluaXRpb24nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2V0dGluZ3MgVFMgZGVmaW5pdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEdlbmVyYXRlIGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBmb3IgZWRpdG9yIHNldHRpbmdzIGR1bXBzLiBzZXR0aW5nc1R5cGUgc2VsZWN0cyB3aGljaCBkdW1wOiBDb21tb25UeXBlcyByZXR1cm5zIHRoZSBjb21tb24gY29jb3MgdmFsdWUgdHlwZXM7IEN1cnJlbnRTY2VuZUdsb2JhbHMgZHVtcHMgY3VycmVudCBzY2VuZSBnbG9iYWxzOyBQcm9qZWN0U2V0dGluZ3MgZHVtcHMgY29jb3MgcHJvamVjdCBzZXR0aW5ncyBjYXRlZ29yaWVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzZXR0aW5nc1R5cGU6IHouZW51bShbJ0NvbW1vblR5cGVzJywgJ0N1cnJlbnRTY2VuZUdsb2JhbHMnLCAnUHJvamVjdFNldHRpbmdzJ10pLmRlc2NyaWJlKCdXaGljaCBzZXR0aW5ncyBkdW1wIHRvIHJlbmRlci4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTZXR0aW5nc0RlZmluaXRpb24oYXJnczogeyBzZXR0aW5nc1R5cGU6ICdDb21tb25UeXBlcycgfCAnQ3VycmVudFNjZW5lR2xvYmFscycgfCAnUHJvamVjdFNldHRpbmdzJyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgc3dpdGNoIChhcmdzLnNldHRpbmdzVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnQ29tbW9uVHlwZXMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBvayh7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0pO1xuICAgICAgICAgICAgY2FzZSAnQ3VycmVudFNjZW5lR2xvYmFscyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3NldHRpbmdzIGludHJvc3BlY3Rpb24gZm9yIEN1cnJlbnRTY2VuZUdsb2JhbHMgbm90IHlldCB3aXJlZCDigJQgcGVuZGluZyBjb2NvcyBjaGFubmVsIHJlc2VhcmNoLicpO1xuICAgICAgICAgICAgY2FzZSAnUHJvamVjdFNldHRpbmdzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnUHJvamVjdFNldHRpbmdzIGludHJvc3BlY3Rpb24gbm90IHlldCB3aXJlZCDigJQgcGVuZGluZyBjb2NvcyBjaGFubmVsIHJlc2VhcmNoLicpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBzZXR0aW5nc1R5cGU6ICR7KGFyZ3MgYXMgYW55KS5zZXR0aW5nc1R5cGV9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfaW5zdGFuY2VfcHJvcGVydGllcycsXG4gICAgICAgIHRpdGxlOiAnU2V0IGluc3RhbmNlIHByb3BlcnRpZXMgKGdlbmVyaWMpJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gR2VuZXJpYyBiYXRjaCBwcm9wZXJ0eSB3cml0ZXIgdGhhdCBkaXNwYXRjaGVzIHRvIHRoZSByaWdodCBzZXR0ZXIgYmFzZWQgb24gaW5zdGFuY2Uga2luZC4gcmVmZXJlbmNlLnR5cGUgcHJlZml4IHJvdXRlczogYXNzZXQ6KiDihpIgYXNzZXRNZXRhIHBhdGggKGludGVycHJldGVyLXZhbGlkYXRlZCk7IGNjLkNvbXBvbmVudCAvIGNvbXBvbmVudCBjaWQg4oaSIGNvbXBvbmVudCBwYXRoOyBjYy5Ob2RlIOKGkiBub2RlIHBhdGguIEZvciBzaW5nbGUta2luZCB3b3JrLCB0aGUgc3BlY2lmaWMgdG9vbHMgKGNvbXBvbmVudF9zZXRfY29tcG9uZW50X3Byb3BlcnR5IC8gYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIC8gbm9kZV9zZXRfbm9kZV9wcm9wZXJ0eSkgYXJlIHN0aWxsIHByZWZlcnJlZDsgdXNlIHRoaXMgZm9yIGhldGVyb2dlbmVvdXMgYmF0Y2hlcy4gTm90ZToga2luZC1zcGVjaWZpYyBvcHRpb25zIGxpa2UgcHJlc2VydmVDb250ZW50U2l6ZSBhcmUgbm90IGF2YWlsYWJsZSBoZXJlIOKAlCB1c2UgdGhlIGRlZGljYXRlZCB0b29scyBmb3IgdGhvc2UuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLFxuICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCksXG4gICAgICAgICAgICB9KSkubWluKDEpLm1heCg1MCksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0SW5zdGFuY2VQcm9wZXJ0aWVzKGFyZ3M6IHtcbiAgICAgICAgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZTtcbiAgICAgICAgcHJvcGVydGllczogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueSB9PjtcbiAgICB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UsIHByb3BlcnRpZXMgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9zZXRfaW5zdGFuY2VfcHJvcGVydGllczogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIGNvbnN0IGFzc2V0SW5mb1Jlc3VsdCA9IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKHJlZmVyZW5jZS5pZCk7XG4gICAgICAgIGlmIChhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvIHx8IGlzQXNzZXRSZWZlcmVuY2VIaW50KHJlZmVyZW5jZSkpIHtcbiAgICAgICAgICAgIGlmICghYXNzZXRJbmZvUmVzdWx0LmFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGFzc2V0SW5mb1Jlc3VsdC5lcnJvciA/PyBgaW5zcGVjdG9yOiBhc3NldCBub3QgZm91bmQgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFzc2V0TWV0YVRvb2xzLmV4ZWN1dGUoJ3NldF9wcm9wZXJ0aWVzJywge1xuICAgICAgICAgICAgICAgIHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdhc3NldCcsIHByb3BlcnRpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzTm9kZVJlZmVyZW5jZShyZWZlcmVuY2UpKSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5ub2RlVG9vbHMuZXhlY3V0ZSgnc2V0X25vZGVfcHJvcGVydGllcycsIHtcbiAgICAgICAgICAgICAgICByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllcy5tYXAocCA9PiAoeyBwYXRoOiBwLnBhdGgsIHZhbHVlOiBwLnZhbHVlIH0pKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZURlbGVnYXRlZEJhdGNoUmVzcG9uc2UocmVzcCwgJ25vZGUnLCBwcm9wZXJ0aWVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudFRhcmdldCA9IGF3YWl0IHJlc29sdmVDb21wb25lbnRUYXJnZXQocmVmZXJlbmNlKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gY29tcG9uZW50VGFyZ2V0KSByZXR1cm4gZmFpbChjb21wb25lbnRUYXJnZXQuZXJyb3IpO1xuICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdzZXRfY29tcG9uZW50X3Byb3BlcnRpZXMnLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY29tcG9uZW50VGFyZ2V0Lm5vZGVVdWlkLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogY29tcG9uZW50VGFyZ2V0LmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHk6IHAucGF0aCxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdjb21wb25lbnQnLCBwcm9wZXJ0aWVzKTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgY2xhc3NOYW1lLCBkdW1wLCBpc0NvbXBvbmVudCk7XG4gICAgcmV0dXJuIGN0eC5kZWZpbml0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQXNzZXRJbXBvcnRlckNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBhcnJheXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBzdHJpbmcge1xuICAgIGNvbnN0IGN0eDogUmVuZGVyQ29udGV4dCA9IHsgZGVmaW5pdGlvbnM6IFtdLCBkZWZpbmVkTmFtZXM6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2BjbGFzcyAke3Nhbml0aXplVHNOYW1lKGNsYXNzTmFtZSl9IHtgXTtcbiAgICBjb25zdCBwYXRocyA9IG5ldyBTZXQoWy4uLk9iamVjdC5rZXlzKHByb3BlcnRpZXMpLCAuLi5PYmplY3Qua2V5cyhhcnJheXMgPz8ge30pXSk7XG4gICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi5wYXRoc10uc29ydCgpKSB7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gcHJvcGVydGllc1twYXRoXTtcbiAgICAgICAgY29uc3QgdG9vbHRpcCA9IHJlc29sdmVJMThuVGV4dChlbnRyeT8udG9vbHRpcCk7XG4gICAgICAgIGlmICh0b29sdGlwICYmIHR5cGVvZiB0b29sdGlwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8qKiAke3Nhbml0aXplRm9yQ29tbWVudCh0b29sdGlwKX0gKi9gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbnVtTGlzdCA9IGVudW1PckJpdG1hc2tMaXN0KGVudHJ5KTtcbiAgICAgICAgbGV0IHRzVHlwZTogc3RyaW5nO1xuICAgICAgICBsZXQgZGVjb3JhdG9yVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAoZW51bUxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudW1OYW1lID0gcGFzY2FsQ2FzZU5hbWUocGF0aCk7XG4gICAgICAgICAgICBnZW5lcmF0ZUNvbnN0RW51bURlZmluaXRpb24oY3R4LCBlbnVtTmFtZSwgZW51bUxpc3QpO1xuICAgICAgICAgICAgdHNUeXBlID0gZW51bU5hbWU7XG4gICAgICAgICAgICBkZWNvcmF0b3JUeXBlID0gZW51bU5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0c1R5cGUgPSByZXNvbHZlVHNUeXBlKGVudHJ5ID8/IGFycmF5c1twYXRoXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFycmF5cyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYXJyYXlzLCBwYXRoKSkge1xuICAgICAgICAgICAgdHNUeXBlID0gYEFycmF5PCR7dHNUeXBlfT5gO1xuICAgICAgICAgICAgaWYgKGRlY29yYXRvclR5cGUpIGRlY29yYXRvclR5cGUgPSBgWyR7ZGVjb3JhdG9yVHlwZX1dYDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkZWNvcmF0b3IgPSByZW5kZXJQcm9wZXJ0eURlY29yYXRvcihlbnRyeSwgZGVjb3JhdG9yVHlwZSk7XG4gICAgICAgIGlmIChkZWNvcmF0b3IpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAke2RlY29yYXRvcn1gKTtcbiAgICAgICAgfVxuICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtyZW5kZXJQYXRoQXNQcm9wZXJ0eShwYXRoKX06ICR7dHNUeXBlfTtgKTtcbiAgICB9XG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIHJldHVybiBbLi4uY3R4LmRlZmluaXRpb25zLCBsaW5lcy5qb2luKCdcXG4nKV0uam9pbignXFxuXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclBhdGhBc1Byb3BlcnR5KHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGlzU2FmZVRzSWRlbnRpZmllcihwYXRoKSA/IHBhdGggOiBKU09OLnN0cmluZ2lmeShwYXRoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcXVlcnlBc3NldEluZm8oaWQ6IHN0cmluZyk6IFByb21pc2U8eyBhc3NldEluZm8/OiBhbnk7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgaWQpO1xuICAgICAgICByZXR1cm4gYXNzZXRJbmZvID8geyBhc3NldEluZm8gfSA6IHt9O1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgcXVlcnktYXNzZXQtaW5mbyBmYWlsZWQgZm9yICR7aWR9OiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc0Fzc2V0UmVmZXJlbmNlSGludChyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGVvZiByZWZlcmVuY2UudHlwZSA9PT0gJ3N0cmluZycgJiYgcmVmZXJlbmNlLnR5cGUuc3RhcnRzV2l0aCgnYXNzZXQ6Jyk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZVJlZmVyZW5jZShyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogYm9vbGVhbiB7XG4gICAgY29uc3QgdCA9IHJlZmVyZW5jZS50eXBlO1xuICAgIHJldHVybiAhdCB8fCB0ID09PSAnbm9kZScgfHwgdCA9PT0gJ05vZGUnIHx8IHQgPT09ICdjYy5Ob2RlJztcbn1cblxuZnVuY3Rpb24gYXNzZXRDbGFzc05hbWUoYXNzZXRJbmZvOiBhbnksIHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJhdyA9IFN0cmluZyhyZWZlcmVuY2UudHlwZT8ucmVwbGFjZSgvXmFzc2V0Oi8sICcnKSB8fCBhc3NldEluZm8udHlwZSB8fCBhc3NldEluZm8uaW1wb3J0ZXIgfHwgJ0Fzc2V0Jyk7XG4gICAgcmV0dXJuIHNhbml0aXplVHNOYW1lKHJhdy5yZXBsYWNlKC9eY2NcXC4vLCAnJykpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50VGFyZ2V0KHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UpOiBQcm9taXNlPHsgbm9kZVV1aWQ6IHN0cmluZzsgY29tcG9uZW50VHlwZTogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IGZvdW5kID0gYXdhaXQgZmluZENvbXBvbmVudEluU2NlbmUocmVmZXJlbmNlLmlkKTtcbiAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcbiAgICBpZiAocmVmZXJlbmNlLnR5cGUgJiYgIWlzTm9kZVJlZmVyZW5jZShyZWZlcmVuY2UpICYmICFpc0Fzc2V0UmVmZXJlbmNlSGludChyZWZlcmVuY2UpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgcmVmZXJlbmNlLmlkKTtcbiAgICAgICAgICAgIGlmIChkdW1wICYmIEFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgbm9kZVV1aWQ6IHJlZmVyZW5jZS5pZCwgY29tcG9uZW50VHlwZTogcmVmZXJlbmNlLnR5cGUgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBSZXR1cm4gdGhlIGNvbXBvbmVudCBsb29rdXAgZmFpbHVyZSBiZWxvdy5cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyBlcnJvcjogYGluc3BlY3Rvcl9zZXRfaW5zdGFuY2VfcHJvcGVydGllczogY291bGQgbm90IHJlc29sdmUgY29tcG9uZW50IHJlZmVyZW5jZSAke3JlZmVyZW5jZS5pZH0uIFBhc3MgcmVmZXJlbmNlLmlkIGFzIGEgY29tcG9uZW50IFVVSUQgd2l0aCByZWZlcmVuY2UudHlwZSBhcyB0aGUgY29tcG9uZW50IGNpZC90eXBlLCBvciB1c2UgY2MuTm9kZSBmb3Igbm9kZSBwcm9wZXJ0aWVzLmAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmluZENvbXBvbmVudEluU2NlbmUoY29tcG9uZW50VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IG5vZGVVdWlkOiBzdHJpbmc7IGNvbXBvbmVudFR5cGU6IHN0cmluZyB9IHwgbnVsbD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRyZWUgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgY29uc3QgcXVldWU6IGFueVtdID0gQXJyYXkuaXNBcnJheSh0cmVlKSA/IFsuLi50cmVlXSA6IFt0cmVlXTtcbiAgICAgICAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBpdGVtPy51dWlkPy52YWx1ZSA/PyBpdGVtPy51dWlkO1xuICAgICAgICAgICAgaWYgKCFub2RlVXVpZCkgY29udGludWU7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcHM6IGFueVtdID0gQXJyYXkuaXNBcnJheShkdW1wPy5fX2NvbXBzX18pID8gZHVtcC5fX2NvbXBzX18gOiBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IGNvbXA/LnZhbHVlPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkO1xuICAgICAgICAgICAgICAgICAgICBpZiAodXVpZCA9PT0gY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBTdHJpbmcoY29tcD8uX190eXBlX18gPz8gY29tcD8uY2lkID8/IGNvbXA/LnR5cGUgPz8gJ2NjLkNvbXBvbmVudCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIEtlZXAgc2Nhbm5pbmcgb3RoZXIgbm9kZXMuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtPy5jaGlsZHJlbikpIHF1ZXVlLnB1c2goLi4uaXRlbS5jaGlsZHJlbik7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKFxuICAgIHJlc3A6IFRvb2xSZXNwb25zZSxcbiAgICBraW5kOiAnbm9kZScgfCAnY29tcG9uZW50JyB8ICdhc3NldCcsXG4gICAgcmVxdWVzdGVkOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55IH0+LFxuKTogVG9vbFJlc3BvbnNlIHtcbiAgICBjb25zdCByYXdSZXN1bHRzID0gQXJyYXkuaXNBcnJheShyZXNwLmRhdGE/LnJlc3VsdHMpID8gcmVzcC5kYXRhLnJlc3VsdHMgOiBudWxsO1xuICAgIGNvbnN0IHJlc3VsdHMgPSByYXdSZXN1bHRzXG4gICAgICAgID8gcmF3UmVzdWx0cy5tYXAoKHI6IGFueSwgaTogbnVtYmVyKSA9PiAoe1xuICAgICAgICAgICAgcGF0aDogci5wYXRoID8/IHIucHJvcGVydHkgPz8gci5wcm9wZXJ0eVBhdGggPz8gcmVxdWVzdGVkW2ldPy5wYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogISFyLnN1Y2Nlc3MsXG4gICAgICAgICAgICBlcnJvcjogci5zdWNjZXNzID8gdW5kZWZpbmVkIDogKHIuZXJyb3IgPz8gJ3Vua25vd24nKSxcbiAgICAgICAgICAgIHdhcm5pbmc6IHIud2FybmluZyxcbiAgICAgICAgfSkpXG4gICAgICAgIDogcmVxdWVzdGVkLm1hcChwID0+ICh7XG4gICAgICAgICAgICBwYXRoOiBwLnBhdGgsXG4gICAgICAgICAgICBzdWNjZXNzOiAhIXJlc3Auc3VjY2VzcyxcbiAgICAgICAgICAgIGVycm9yOiByZXNwLnN1Y2Nlc3MgPyB1bmRlZmluZWQgOiAocmVzcC5lcnJvciA/PyByZXNwLm1lc3NhZ2UgPz8gJ3Vua25vd24nKSxcbiAgICAgICAgfSkpO1xuICAgIGNvbnN0IGZhaWxlZENvdW50ID0gcmVzdWx0cy5maWx0ZXIoKHI6IGFueSkgPT4gIXIuc3VjY2VzcykubGVuZ3RoO1xuICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHJlc3VsdHMuc29tZSgocjogYW55KSA9PiByLnN1Y2Nlc3MpLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBraW5kLFxuICAgICAgICAgICAgdG90YWw6IHJlc3VsdHMubGVuZ3RoLFxuICAgICAgICAgICAgZmFpbGVkQ291bnQsXG4gICAgICAgICAgICByZXN1bHRzLFxuICAgICAgICAgICAgZGVsZWdhdGVkOiByZXNwLmRhdGEsXG4gICAgICAgIH0sXG4gICAgICAgIG1lc3NhZ2U6IGZhaWxlZENvdW50ID09PSAwXG4gICAgICAgICAgICA/IGBXcm90ZSAke3Jlc3VsdHMubGVuZ3RofSAke2tpbmR9IHByb3BlcnRpZXNgXG4gICAgICAgICAgICA6IGAke2ZhaWxlZENvdW50fS8ke3Jlc3VsdHMubGVuZ3RofSAke2tpbmR9IHByb3BlcnR5IHdyaXRlcyBmYWlsZWRgLFxuICAgIH07XG4gICAgaWYgKHJlc3Aud2FybmluZykgcmVzcG9uc2Uud2FybmluZyA9IHJlc3Aud2FybmluZztcbiAgICBpZiAoIXJlc3BvbnNlLnN1Y2Nlc3MpIHJlc3BvbnNlLmVycm9yID0gcmVzcC5lcnJvciA/PyByZXNwLm1lc3NhZ2UgPz8gcmVzcG9uc2UubWVzc2FnZTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmludGVyZmFjZSBSZW5kZXJDb250ZXh0IHtcbiAgICBkZWZpbml0aW9uczogc3RyaW5nW107XG4gICAgZGVmaW5lZE5hbWVzOiBTZXQ8c3RyaW5nPjtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkUHJvcGVydHlUeXBlIHtcbiAgICB0c1R5cGU6IHN0cmluZztcbiAgICBkZWNvcmF0b3JUeXBlPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzVHNDbGFzcyhjdHg6IFJlbmRlckNvbnRleHQsIGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3Qgc2FmZUNsYXNzTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyhjbGFzc05hbWUgPz8gJycpLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgaWYgKGN0eC5kZWZpbmVkTmFtZXMuaGFzKHNhZmVDbGFzc05hbWUpKSByZXR1cm47XG4gICAgY3R4LmRlZmluZWROYW1lcy5hZGQoc2FmZUNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBjbGFzcyAke3NhZmVDbGFzc05hbWV9JHtpc0NvbXBvbmVudCA/ICcgZXh0ZW5kcyBDb21wb25lbnQnIDogJyd9IHtgKTtcblxuICAgIGlmIChkdW1wICYmIHR5cGVvZiBkdW1wID09PSAnb2JqZWN0Jykge1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BOYW1lIG9mIE9iamVjdC5rZXlzKGR1bXApKSB7XG4gICAgICAgICAgICBpZiAoTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVMuaGFzKHByb3BOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBwcm9wRW50cnkgPSBkdW1wW3Byb3BOYW1lXTtcbiAgICAgICAgICAgIGlmIChwcm9wRW50cnkgPT09IHVuZGVmaW5lZCB8fCBwcm9wRW50cnkgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgLy8gQ29jb3MgZHVtcCBlbnRyaWVzIGFyZSB0eXBpY2FsbHkgYHt0eXBlLCB2YWx1ZSwgdmlzaWJsZT8sIHJlYWRvbmx5PywgLi4ufWAuXG4gICAgICAgICAgICAvLyBTa2lwIGV4cGxpY2l0bHktaGlkZGVuIGluc3BlY3RvciBmaWVsZHM7IHRoZXkncmUgbm90IHVzZXItZmFjaW5nLlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wRW50cnkgPT09ICdvYmplY3QnICYmIHByb3BFbnRyeS52aXNpYmxlID09PSBmYWxzZSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRzUHJvcGVydHlUeXBlKGN0eCwgc2FmZUNsYXNzTmFtZSwgcHJvcE5hbWUsIHByb3BFbnRyeSk7XG4gICAgICAgICAgICBjb25zdCByZWFkb25seSA9IHByb3BFbnRyeT8ucmVhZG9ubHkgPyAncmVhZG9ubHkgJyA6ICcnO1xuICAgICAgICAgICAgY29uc3QgdG9vbHRpcFNyYzogc3RyaW5nIHwgdW5kZWZpbmVkID0gcHJvcEVudHJ5Py50b29sdGlwO1xuICAgICAgICAgICAgY29uc3QgdG9vbHRpcCA9IHJlc29sdmVJMThuVGV4dCh0b29sdGlwU3JjKTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwICYmIHR5cGVvZiB0b29sdGlwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtzYW5pdGl6ZUZvckNvbW1lbnQodG9vbHRpcCl9ICovYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkZWNvcmF0b3IgPSByZW5kZXJQcm9wZXJ0eURlY29yYXRvcihwcm9wRW50cnksIHJlc29sdmVkLmRlY29yYXRvclR5cGUpO1xuICAgICAgICAgICAgaWYgKGRlY29yYXRvcikge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAke2RlY29yYXRvcn1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHNhZmVQcm9wTmFtZSA9IGlzU2FmZVRzSWRlbnRpZmllcihwcm9wTmFtZSkgPyBwcm9wTmFtZSA6IEpTT04uc3RyaW5naWZ5KHByb3BOYW1lKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAke3JlYWRvbmx5fSR7c2FmZVByb3BOYW1lfTogJHtyZXNvbHZlZC50c1R5cGV9O2ApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFpc0NvbXBvbmVudCAmJiBBcnJheS5pc0FycmF5KGR1bXA/Ll9fY29tcHNfXykgJiYgZHVtcC5fX2NvbXBzX18ubGVuZ3RoID4gMCkge1xuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnICAgIC8vIENvbXBvbmVudHMgb24gdGhpcyBub2RlIChpbnNwZWN0IGVhY2ggc2VwYXJhdGVseSB2aWEgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gd2l0aCB0aGUgaG9zdCBub2RlIFVVSUQgZmlyc3QpOicpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZHVtcC5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIGNvbnN0IGNUeXBlID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy5fX3R5cGVfXyA/PyBjb21wPy50eXBlID8/ICd1bmtub3duJykpO1xuICAgICAgICAgICAgY29uc3QgY1V1aWQgPSBzYW5pdGl6ZUZvckNvbW1lbnQoU3RyaW5nKGNvbXA/LnZhbHVlPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkPy52YWx1ZSA/PyBjb21wPy51dWlkID8/ICc/JykpO1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8vIC0gJHtjVHlwZX0gIHV1aWQ9JHtjVXVpZH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBjdHguZGVmaW5pdGlvbnMucHVzaChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB0b29sdGlwcyBhbmQgY29tcG9uZW50IG1ldGFkYXRhIGNhblxuLy8gY29udGFpbiBgKi9gIChjbG9zZXMgdGhlIGRvYyBjb21tZW50KSwgYFxcbmAgKGJyZWFrcyBhIGAvL2AgY29tbWVudFxuLy8gaW50byBzdHJheSBjb2RlKSwgb3IgYFxccmAuIFNpbmdsZS1saW5lLWNvbW1lbnQgY29udGV4dCBpcyB0aGVcbi8vIGRhbmdlcm91cyBvbmUuIFN0cmlwIGJvdGguXG5mdW5jdGlvbiBzYW5pdGl6ZUZvckNvbW1lbnQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvXFwqXFwvL2csICcqXFxcXC8nKVxuICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJyAnKTtcbn1cblxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHVuc2FuaXRpemVkIGN1c3RvbS1zY3JpcHQgY2xhc3MgbmFtZXNcbi8vIChlLmcuIGBNeS5Gb29gLCBgTXktRm9vYCkgZW1pdHRlZCBkaXJlY3RseSBpbnRvIHRoZSBUUyBvdXRwdXQgcHJvZHVjZVxuLy8gaW52YWxpZCBUUy4gSlNPTi1zdHJpbmdpZnkgYW55IHByb3BlcnR5IG5hbWUgdGhhdCBpc24ndCBhIHBsYWluIGlkZW50LlxuZnVuY3Rpb24gaXNTYWZlVHNJZGVudGlmaWVyKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAvXltBLVphLXpfJF1bQS1aYS16MC05XyRdKiQvLnRlc3QobmFtZSk7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUc1Byb3BlcnR5VHlwZShjdHg6IFJlbmRlckNvbnRleHQsIG93bmVyQ2xhc3NOYW1lOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIGVudHJ5OiBhbnkpOiBSZXNvbHZlZFByb3BlcnR5VHlwZSB7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnk/LmlzQXJyYXk7XG4gICAgY29uc3QgaXRlbUVudHJ5ID0gaXNBcnJheSA/IGFycmF5SXRlbUVudHJ5KGVudHJ5KSA6IGVudHJ5O1xuICAgIGNvbnN0IGVudW1MaXN0ID0gZW51bU9yQml0bWFza0xpc3QoaXRlbUVudHJ5KSA/PyBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeSk7XG4gICAgaWYgKGVudW1MaXN0KSB7XG4gICAgICAgIGNvbnN0IGVudW1OYW1lID0gcGFzY2FsQ2FzZU5hbWUocHJvcE5hbWUpO1xuICAgICAgICBnZW5lcmF0ZUNvbnN0RW51bURlZmluaXRpb24oY3R4LCBlbnVtTmFtZSwgZW51bUxpc3QpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7ZW51bU5hbWV9PmAgOiBlbnVtTmFtZSxcbiAgICAgICAgICAgIGRlY29yYXRvclR5cGU6IGlzQXJyYXkgPyBgWyR7ZW51bU5hbWV9XWAgOiBlbnVtTmFtZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBzdHJ1Y3RWYWx1ZSA9IG5lc3RlZFN0cnVjdFZhbHVlKGl0ZW1FbnRyeSk7XG4gICAgaWYgKHN0cnVjdFZhbHVlICYmICFpc0NvbW1vblZhbHVlVHlwZShpdGVtRW50cnk/LnR5cGUpICYmICFpc1JlZmVyZW5jZUVudHJ5KGl0ZW1FbnRyeSkpIHtcbiAgICAgICAgY29uc3Qgc3RydWN0TmFtZSA9IG5lc3RlZFN0cnVjdENsYXNzTmFtZShvd25lckNsYXNzTmFtZSwgcHJvcE5hbWUsIHN0cnVjdFZhbHVlLCBpc0FycmF5KTtcbiAgICAgICAgcHJvY2Vzc1RzQ2xhc3MoY3R4LCBzdHJ1Y3ROYW1lLCBzdHJ1Y3RWYWx1ZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7c3RydWN0TmFtZX0+YCA6IHN0cnVjdE5hbWUsXG4gICAgICAgICAgICBkZWNvcmF0b3JUeXBlOiBpc0FycmF5ID8gYFske3N0cnVjdE5hbWV9XWAgOiBzdHJ1Y3ROYW1lLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHRzVHlwZSA9IHJlc29sdmVUc1R5cGUoaXRlbUVudHJ5KTtcbiAgICByZXR1cm4geyB0c1R5cGU6IGlzQXJyYXkgPyBgQXJyYXk8JHt0c1R5cGV9PmAgOiB0c1R5cGUgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVRzVHlwZShlbnRyeTogYW55KTogc3RyaW5nIHtcbiAgICBpZiAoZW50cnkgPT09IHVuZGVmaW5lZCB8fCBlbnRyeSA9PT0gbnVsbCkgcmV0dXJuICd1bmtub3duJztcbiAgICAvLyBQbGFpbiBwcmltaXRpdmVzIHBhc3NlZCB0aHJvdWdoIGRpcmVjdGx5IChyYXJlIGluIGR1bXAgc2hhcGUpLlxuICAgIGNvbnN0IHR0ID0gdHlwZW9mIGVudHJ5O1xuICAgIGlmICh0dCA9PT0gJ3N0cmluZycpIHJldHVybiAnc3RyaW5nJztcbiAgICBpZiAodHQgPT09ICdudW1iZXInKSByZXR1cm4gJ251bWJlcic7XG4gICAgaWYgKHR0ID09PSAnYm9vbGVhbicpIHJldHVybiAnYm9vbGVhbic7XG5cbiAgICBjb25zdCByYXdUeXBlOiBzdHJpbmcgPSBlbnRyeS50eXBlID8/IGVudHJ5Ll9fdHlwZV9fID8/ICcnO1xuXG4gICAgbGV0IHRzOiBzdHJpbmc7XG4gICAgc3dpdGNoIChyYXdUeXBlKSB7XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6IHRzID0gJ3N0cmluZyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdCb29sZWFuJzogdHMgPSAnYm9vbGVhbic7IGJyZWFrO1xuICAgICAgICBjYXNlICdJbnRlZ2VyJzpcbiAgICAgICAgY2FzZSAnRmxvYXQnOlxuICAgICAgICBjYXNlICdOdW1iZXInOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgIGNhc2UgJ0JpdE1hc2snOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMic6IHRzID0gJ1ZlYzInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMyc6IHRzID0gJ1ZlYzMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjNCc6IHRzID0gJ1ZlYzQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuQ29sb3InOiB0cyA9ICdDb2xvcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5SZWN0JzogdHMgPSAnUmVjdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5TaXplJzogdHMgPSAnU2l6ZSc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5RdWF0JzogdHMgPSAnUXVhdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQzJzogdHMgPSAnTWF0Myc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQ0JzogdHMgPSAnTWF0NCc7IGJyZWFrO1xuICAgICAgICBjYXNlICcnOiB0cyA9ICd1bmtub3duJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIC8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiBzYW5pdGl6ZSBjdXN0b20gY2xhc3MgbmFtZXNcbiAgICAgICAgICAgIC8vIGJlZm9yZSBwYXN0aW5nIHRoZW0gaW50byB0aGUgVFMgb3V0cHV0LiBgTXkuRm9vYCBldGMuXG4gICAgICAgICAgICAvLyB3b3VsZCBiZSBpbnZhbGlkIFRTIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGNvbnN0IHN0cmlwcGVkVHlwZSA9IHNhbml0aXplVHNOYW1lKHJhd1R5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpKSB8fCAndW5rbm93bic7XG4gICAgICAgICAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgaXNSZWZlcmVuY2UgPSBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Db21wb25lbnQnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcbiAgICAgICAgICAgIHRzID0gaXNSZWZlcmVuY2UgPyBgSW5zdGFuY2VSZWZlcmVuY2U8JHtzdHJpcHBlZFR5cGV9PmAgOiBzdHJpcHBlZFR5cGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRzO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQcm9wZXJ0eURlY29yYXRvcihlbnRyeTogYW55LCByZXNvbHZlZFR5cGU/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgdHlwZUV4cHIgPSByZXNvbHZlZFR5cGUgPz8gZGVjb3JhdG9yVHlwZUV4cHJlc3Npb24oZW50cnkpO1xuICAgIGNvbnN0IGhhc0VudW1PckJpdG1hc2tMaXN0ID0gZW51bU9yQml0bWFza0xpc3QoZW50cnkpICE9PSBudWxsXG4gICAgICAgIHx8IGVudW1PckJpdG1hc2tMaXN0KGFycmF5SXRlbUVudHJ5KGVudHJ5KSkgIT09IG51bGw7XG4gICAgaWYgKChlbnRyeS50eXBlICE9PSB1bmRlZmluZWQgfHwgaGFzRW51bU9yQml0bWFza0xpc3QpICYmIHR5cGVFeHByKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYHR5cGU6ICR7dHlwZUV4cHJ9YCk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBhdHRyIG9mIFsnbWluJywgJ21heCcsICdzdGVwJywgJ3VuaXQnLCAncmFkaWFuJywgJ211bHRpbGluZScsICd0b29sdGlwJ10pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBlbnRyeVthdHRyXTtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHBhcnRzLnB1c2goYCR7YXR0cn06ICR7ZGVjb3JhdG9yVmFsdWUoYXR0ciA9PT0gJ3Rvb2x0aXAnIHx8IGF0dHIgPT09ICdkaXNwbGF5TmFtZScgPyByZXNvbHZlSTE4blRleHQodmFsdWUpIDogdmFsdWUpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGBAcHJvcGVydHkoeyAke3BhcnRzLmpvaW4oJywgJyl9IH0pYDtcbn1cblxuZnVuY3Rpb24gZGVjb3JhdG9yVHlwZUV4cHJlc3Npb24oZW50cnk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGlzQXJyYXkgPSAhIWVudHJ5Py5pc0FycmF5O1xuICAgIGNvbnN0IGl0ZW1FbnRyeSA9IGlzQXJyYXkgPyBhcnJheUl0ZW1FbnRyeShlbnRyeSkgOiBlbnRyeTtcbiAgICBjb25zdCByYXdUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBpdGVtRW50cnk/LnR5cGU7XG4gICAgaWYgKCFyYXdUeXBlKSByZXR1cm4gbnVsbDtcblxuICAgIGxldCBleHByOiBzdHJpbmcgfCBudWxsO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdJbnRlZ2VyJzogZXhwciA9ICdDQ0ludGVnZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnRmxvYXQnOlxuICAgICAgICBjYXNlICdOdW1iZXInOiBleHByID0gJ0NDRmxvYXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnU3RyaW5nJzogZXhwciA9ICdTdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IGV4cHIgPSAnQm9vbGVhbic7IGJyZWFrO1xuICAgICAgICBjYXNlICdFbnVtJzpcbiAgICAgICAgY2FzZSAnQml0TWFzayc6IGV4cHIgPSAnTnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGV4cHIgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgfVxuICAgIGlmICghZXhwcikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGlzQXJyYXkgPyBgWyR7ZXhwcn1dYCA6IGV4cHI7XG59XG5cbmZ1bmN0aW9uIGRlY29yYXRvclZhbHVlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSTE4blRleHQodmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ2kxOG46JykpIHJldHVybiB2YWx1ZTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0cmFuc2xhdGVkID0gRWRpdG9yLkkxOG4udCh2YWx1ZS5zbGljZSg1KSk7XG4gICAgICAgIGlmICh0eXBlb2YgdHJhbnNsYXRlZCA9PT0gJ3N0cmluZycgJiYgdHJhbnNsYXRlZC50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zbGF0ZWQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gS2VlcCBvcmlnaW5hbCBpMThuIGtleSB3aGVuIGVkaXRvciBsb2NhbGl6YXRpb24gaXMgdW5hdmFpbGFibGUuXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gYXJyYXlJdGVtRW50cnkoZW50cnk6IGFueSk6IGFueSB7XG4gICAgaWYgKGVudHJ5Py5lbGVtZW50VHlwZURhdGEpIHJldHVybiBlbnRyeS5lbGVtZW50VHlwZURhdGE7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50cnk/LnZhbHVlKSAmJiBlbnRyeS52YWx1ZS5sZW5ndGggPiAwKSByZXR1cm4gZW50cnkudmFsdWVbMF07XG4gICAgcmV0dXJuIGVudHJ5O1xufVxuXG5mdW5jdGlvbiBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeTogYW55KTogYW55W10gfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGVudHJ5LmVudW1MaXN0KSA/IGVudHJ5LmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeS5iaXRtYXNrTGlzdCkgPyBlbnRyeS5iaXRtYXNrTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5lbnVtTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5iaXRtYXNrTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5iaXRtYXNrTGlzdFxuICAgICAgICA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlQ29uc3RFbnVtRGVmaW5pdGlvbihjdHg6IFJlbmRlckNvbnRleHQsIGVudW1OYW1lOiBzdHJpbmcsIGl0ZW1zOiBhbnlbXSk6IHZvaWQge1xuICAgIGNvbnN0IHNhZmVFbnVtTmFtZSA9IHNhbml0aXplVHNOYW1lKGVudW1OYW1lKTtcbiAgICBpZiAoY3R4LmRlZmluZWROYW1lcy5oYXMoc2FmZUVudW1OYW1lKSkgcmV0dXJuO1xuICAgIGN0eC5kZWZpbmVkTmFtZXMuYWRkKHNhZmVFbnVtTmFtZSk7XG5cbiAgICBjb25zdCB1c2VkTWVtYmVyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbYGNvbnN0IGVudW0gJHtzYWZlRW51bU5hbWV9IHtgXTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCByYXdOYW1lID0gaXRlbT8ubmFtZSA/PyBpdGVtPy5kaXNwbGF5TmFtZSA/PyBpdGVtPy52YWx1ZSA/PyBgVmFsdWUke2luZGV4fWA7XG4gICAgICAgIGxldCBtZW1iZXJOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHJhd05hbWUpKTtcbiAgICAgICAgaWYgKHVzZWRNZW1iZXJOYW1lcy5oYXMobWVtYmVyTmFtZSkpIHtcbiAgICAgICAgICAgIG1lbWJlck5hbWUgPSBgJHttZW1iZXJOYW1lfV8ke2luZGV4fWA7XG4gICAgICAgIH1cbiAgICAgICAgdXNlZE1lbWJlck5hbWVzLmFkZChtZW1iZXJOYW1lKTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBpdGVtPy52YWx1ZTtcbiAgICAgICAgY29uc3QgaW5pdGlhbGl6ZXIgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKVxuICAgICAgICAgICAgOiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyBTdHJpbmcodmFsdWUpXG4gICAgICAgICAgICAgICAgOiBTdHJpbmcoaW5kZXgpO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHttZW1iZXJOYW1lfSA9ICR7aW5pdGlhbGl6ZXJ9LGApO1xuICAgIH0pO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBjdHguZGVmaW5pdGlvbnMucHVzaChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbmZ1bmN0aW9uIG5lc3RlZFN0cnVjdFZhbHVlKGVudHJ5OiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHZhbHVlID0gZW50cnkudmFsdWU7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpICYmICdfX3R5cGVfXycgaW4gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAoJ19fdHlwZV9fJyBpbiBlbnRyeSAmJiAhKCd0eXBlJyBpbiBlbnRyeSkpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbmVzdGVkU3RydWN0Q2xhc3NOYW1lKG93bmVyQ2xhc3NOYW1lOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnksIGlzQXJyYXk6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgIGNvbnN0IHR5cGVOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHZhbHVlPy5fX3R5cGVfXyA/PyAnJykucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbiAgICBpZiAodHlwZU5hbWUgJiYgdHlwZU5hbWUgIT09ICdfVW5rbm93bicgJiYgdHlwZU5hbWUgIT09ICdPYmplY3QnKSB7XG4gICAgICAgIHJldHVybiB0eXBlTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhbml0aXplVHNOYW1lKGAke293bmVyQ2xhc3NOYW1lfSR7cGFzY2FsQ2FzZU5hbWUocHJvcE5hbWUpfSR7aXNBcnJheSA/ICdJdGVtJyA6ICdUeXBlJ31gKTtcbn1cblxuZnVuY3Rpb24gaXNDb21tb25WYWx1ZVR5cGUodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdjYy5WZWMyJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuVmVjMydcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlZlYzQnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5Db2xvcidcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlJlY3QnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5TaXplJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuUXVhdCdcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLk1hdDMnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5NYXQ0Jztcbn1cblxuZnVuY3Rpb24gaXNSZWZlcmVuY2VFbnRyeShlbnRyeTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcbiAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdDb21wb25lbnQnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICB8fCAocmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKSAmJiAhaXNDb21tb25WYWx1ZVR5cGUocmF3VHlwZSkpO1xufVxuXG5mdW5jdGlvbiBwYXNjYWxDYXNlTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHdvcmRzID0gU3RyaW5nKG5hbWUgPz8gJycpXG4gICAgICAgIC5yZXBsYWNlKC8oW2EtejAtOV0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAuc3BsaXQoL1teQS1aYS16MC05XSsvKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgIGNvbnN0IHBhc2NhbCA9IHdvcmRzLm1hcCgod29yZCkgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkpLmpvaW4oJycpO1xuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShwYXNjYWwgfHwgbmFtZSB8fCAnVmFsdWUnKTtcbn1cblxuZnVuY3Rpb24gaXNDb21wb25lbnREdW1wKGR1bXA6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZHVtcCB8fCB0eXBlb2YgZHVtcCAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICcnKTtcbiAgICBpZiAocmF3VHlwZSA9PT0gJ05vZGUnIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGV4dGVuZHNMaXN0OiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoZHVtcC5leHRlbmRzKSA/IGR1bXAuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuQ29tcG9uZW50JykgfHwgIUFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pO1xufVxuXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0aGUgdjIuNC4xIGltcGxlbWVudGF0aW9uIG9ubHkgc3RyaXBwZWRcbi8vIG5vbi1pZGVudGlmaWVyIGNoYXJhY3RlcnMgYnV0IGRpZG4ndCBndWFyZCBhZ2FpbnN0IGEgZGlnaXQtbGVhZGluZ1xuLy8gcmVzdWx0IChgY2xhc3MgMmRTcHJpdGVgKSBvciBhbiBlbXB0eSByZXN1bHQgKGFmdGVyIHN0cmlwcGluZyBhbGxcbi8vIGNoYXJzIGluIGEgVVVJRC1zaGFwZWQgX190eXBlX18pLiBCb3RoIHByb2R1Y2UgaW52YWxpZCBUUy4gUHJlZml4XG4vLyBkaWdpdC1sZWFkaW5nIGFuZCBlbXB0eSBjYXNlcyB3aXRoIGBfYCAvIGBfVW5rbm93bmAuXG5mdW5jdGlvbiBzYW5pdGl6ZVRzTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBTdHJpbmcobmFtZSA/PyAnJykucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCAnXycpO1xuICAgIGlmIChjbGVhbmVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdfVW5rbm93bic7XG4gICAgaWYgKC9eWzAtOV0vLnRlc3QoY2xlYW5lZCkpIHJldHVybiBgXyR7Y2xlYW5lZH1gO1xuICAgIHJldHVybiBjbGVhbmVkO1xufVxuIl19