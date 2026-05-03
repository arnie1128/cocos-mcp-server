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
const dump_unwrap_1 = require("../lib/dump-unwrap");
const scene_root_1 = require("../lib/scene-root");
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
        var _a, _b;
        switch (args.settingsType) {
            case 'CommonTypes':
                return (0, response_1.ok)({ definition: COMMON_TYPES_DEFINITION });
            case 'CurrentSceneGlobals': {
                try {
                    const rootUuid = await (0, scene_root_1.getSceneRootUuid)();
                    if (!rootUuid) {
                        return (0, response_1.fail)('CurrentSceneGlobals: no scene root node found');
                    }
                    const dump = await Editor.Message.request('scene', 'query-node', rootUuid);
                    const globals = (0, dump_unwrap_1.dumpUnwrap)(dump === null || dump === void 0 ? void 0 : dump._globals);
                    if (!globals) {
                        return (0, response_1.fail)('CurrentSceneGlobals: no _globals found on scene root node');
                    }
                    const ts = renderTsClass('SceneGlobals', globals, false);
                    return (0, response_1.ok)({ definition: ts, settingsType: 'CurrentSceneGlobals' });
                }
                catch (err) {
                    return (0, response_1.fail)(`CurrentSceneGlobals: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
                }
            }
            case 'ProjectSettings': {
                try {
                    const projectSettings = await Editor.Message.request('project', 'query-config', 'project');
                    if (!projectSettings || typeof projectSettings !== 'object') {
                        return (0, response_1.fail)('ProjectSettings: query-config returned no data');
                    }
                    const ts = renderPlainJsonClass('ProjectSettings', projectSettings);
                    return (0, response_1.ok)({ definition: ts, settingsType: 'ProjectSettings' });
                }
                catch (err) {
                    return (0, response_1.fail)(`ProjectSettings: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}`);
                }
            }
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
function renderPlainJsonClass(className, obj) {
    const lines = [`class ${sanitizeTsName(className)} {`];
    for (const key of Object.keys(obj).sort()) {
        const propName = isSafeTsIdentifier(key) ? key : JSON.stringify(key);
        lines.push(`    ${propName}: ${plainJsonToTsType(obj[key])};`);
    }
    lines.push('}');
    return lines.join('\n');
}
function plainJsonToTsType(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'string')
        return 'string';
    if (typeof value === 'number')
        return 'number';
    if (typeof value === 'boolean')
        return 'boolean';
    if (Array.isArray(value)) {
        return `Array<${value.length > 0 ? plainJsonToTsType(value[0]) : 'unknown'}>`;
    }
    if (typeof value === 'object')
        return 'Record<string, unknown>';
    return 'unknown';
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
    var _a, _b, _c, _d, _e;
    try {
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const queue = Array.isArray(tree) ? [...tree] : [tree];
        while (queue.length > 0) {
            const item = queue.shift();
            const nodeUuid = (0, dump_unwrap_1.dumpUnwrap)(item === null || item === void 0 ? void 0 : item.uuid);
            if (!nodeUuid)
                continue;
            try {
                const dump = await Editor.Message.request('scene', 'query-node', nodeUuid);
                const comps = Array.isArray(dump === null || dump === void 0 ? void 0 : dump.__comps__) ? dump.__comps__ : [];
                for (const comp of comps) {
                    const uuid = (0, dump_unwrap_1.dumpUnwrap)((_b = (_a = comp === null || comp === void 0 ? void 0 : comp.value) === null || _a === void 0 ? void 0 : _a.uuid) !== null && _b !== void 0 ? _b : comp === null || comp === void 0 ? void 0 : comp.uuid);
                    if (uuid === componentUuid) {
                        return {
                            nodeUuid,
                            componentType: String((_e = (_d = (_c = comp === null || comp === void 0 ? void 0 : comp.__type__) !== null && _c !== void 0 ? _c : comp === null || comp === void 0 ? void 0 : comp.cid) !== null && _d !== void 0 ? _d : comp === null || comp === void 0 ? void 0 : comp.type) !== null && _e !== void 0 ? _e : 'cc.Component'),
                        };
                    }
                }
            }
            catch (_f) {
                // Keep scanning other nodes.
            }
            if (Array.isArray(item === null || item === void 0 ? void 0 : item.children))
                queue.push(...item.children);
        }
    }
    catch (_g) {
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
    var _a, _b, _c, _d;
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
            const cUuid = sanitizeForComment(String((0, dump_unwrap_1.dumpUnwrap)((_d = (_c = comp === null || comp === void 0 ? void 0 : comp.value) === null || _c === void 0 ? void 0 : _c.uuid) !== null && _d !== void 0 ? _d : comp === null || comp === void 0 ? void 0 : comp.uuid, '?')));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBQ3ZGLHlEQUFvRDtBQUNwRCx1REFBbUQ7QUFDbkQsNkNBQXlDO0FBQ3pDLG9EQUFnRDtBQUNoRCxrREFBcUQ7QUFFckQsTUFBTSx1QkFBdUIsR0FBRzs7Ozs7Ozs7Ozs7Ozs7OztDQWdCL0IsQ0FBQztBQUVGLDhEQUE4RDtBQUM5RCwrREFBK0Q7QUFDL0Qsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSxtQ0FBbUM7QUFDbkMsRUFBRTtBQUNGLHVFQUF1RTtBQUN2RSxtRUFBbUU7QUFDbkUsc0VBQXNFO0FBQ3RFLDhCQUE4QjtBQUM5QixNQUFNLHVCQUF1QixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ3BDLFVBQVUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLGtCQUFrQjtJQUN6RCxXQUFXLEVBQUUsS0FBSyxFQUFFLE1BQU07SUFDMUIsVUFBVSxFQUFFLFFBQVE7SUFDcEIsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxpQkFBaUI7SUFDOUQsbUJBQW1CLEVBQUUsYUFBYTtDQUNyQyxDQUFDLENBQUM7QUFFSCxNQUFhLGNBQWM7SUFNdkI7UUFKaUIsbUJBQWMsR0FBRyxJQUFJLGlDQUFjLEVBQUUsQ0FBQztRQUN0QyxtQkFBYyxHQUFHLElBQUksZ0NBQWMsRUFBRSxDQUFDO1FBQ3RDLGNBQVMsR0FBRyxJQUFJLHNCQUFTLEVBQUUsQ0FBQztRQUd6QyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVFuRyxBQUFOLEtBQUssQ0FBQyx3QkFBd0I7UUFDMUIsT0FBTyxJQUFBLGFBQUUsRUFBQyxFQUFFLFVBQVUsRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQVVLLEFBQU4sS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQXNDOztRQUM5RCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLElBQUksQ0FBQyxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxFQUFFLENBQUEsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sSUFBQSxlQUFJLEVBQUMsNkRBQTZELENBQUMsQ0FBQztRQUMvRSxDQUFDO1FBQ0QsTUFBTSxlQUFlLEdBQUcsTUFBTSxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNELElBQUksZUFBZSxDQUFDLFNBQVMsSUFBSSxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQy9ELElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sSUFBQSxlQUFJLEVBQUMsTUFBQSxlQUFlLENBQUMsS0FBSyxtQ0FBSSxrQ0FBa0MsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDNUYsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBRSxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDcEYsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNSLE9BQU8sSUFBQSxlQUFJLEVBQUMsOENBQThDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQy9FLENBQUM7WUFDRCw0REFBNEQ7WUFDNUQsdURBQXVEO1lBQ3ZELHlEQUF5RDtZQUN6RCxvREFBb0Q7WUFDcEQseURBQXlEO1lBQ3pELDBEQUEwRDtZQUMxRCwrQ0FBK0M7WUFDL0MsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQUEsTUFBQSxJQUFJLENBQUMsUUFBUSxtQ0FBSSxJQUFJLENBQUMsSUFBSSxtQ0FBSSxlQUFlLENBQUMsQ0FBQztZQUN2RSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNoRCxNQUFNLHFCQUFxQixHQUFHLFNBQVMsQ0FBQyxJQUFJO21CQUNyQyxTQUFTLENBQUMsSUFBSSxLQUFLLFFBQVE7bUJBQzNCLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsS0FBSyxTQUFTLENBQUM7WUFDekQsTUFBTSxFQUFFLEdBQUcsYUFBYSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDakUsTUFBTSxRQUFRLEdBQWlCO2dCQUMzQixPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsU0FBUyxFQUFFLEVBQUUsRUFBRSxFQUFFLFNBQVMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQUEsSUFBSSxDQUFDLFFBQVEsbUNBQUksU0FBUyxDQUFDLElBQUksRUFBRTtvQkFDdEUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxNQUFNO29CQUNsRCxVQUFVLEVBQUUsRUFBRTtpQkFDakI7YUFDSixDQUFDO1lBQ0YsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO2dCQUN4QixRQUFRLENBQUMsT0FBTyxHQUFHLDhCQUE4QixTQUFTLENBQUMsSUFBSSxtQ0FBbUMsUUFBUSxvQ0FBb0MsQ0FBQztZQUNuSixDQUFDO1lBQ0QsT0FBTyxRQUFRLENBQUM7UUFDcEIsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxJQUFBLGVBQUksRUFBQyxpQ0FBaUMsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLDBCQUEwQixDQUFDLFNBQTRCLEVBQUUsU0FBYzs7UUFDakYsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRTtZQUM3RCxTQUFTO1lBQ1QsZUFBZSxFQUFFLElBQUk7WUFDckIscUJBQXFCLEVBQUUsS0FBSztTQUMvQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU87WUFBRSxPQUFPLElBQUksQ0FBQztRQUMvQixNQUFNLFNBQVMsR0FBRyxHQUFHLGNBQWMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQztRQUNwRSxNQUFNLEVBQUUsR0FBRyx3QkFBd0IsQ0FBQyxTQUFTLEVBQUUsTUFBQSxNQUFBLElBQUksQ0FBQyxJQUFJLDBDQUFFLFVBQVUsbUNBQUksRUFBRSxFQUFFLE1BQUEsTUFBQSxJQUFJLENBQUMsSUFBSSwwQ0FBRSxNQUFNLG1DQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3JHLE9BQU8sSUFBQSxhQUFFLEVBQUM7WUFDTixTQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBQSxTQUFTLENBQUMsSUFBSSxtQ0FBSSxTQUFTLENBQUMsSUFBSSxFQUFFO1lBQ3ZFLElBQUksRUFBRSxPQUFPO1lBQ2IsUUFBUSxFQUFFLFNBQVMsQ0FBQyxRQUFRO1lBQzVCLFVBQVUsRUFBRSxFQUFFO1NBQ2pCLENBQUMsQ0FBQztJQUNQLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFpRjs7UUFDekcsUUFBUSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDeEIsS0FBSyxhQUFhO2dCQUNkLE9BQU8sSUFBQSxhQUFFLEVBQUMsRUFBRSxVQUFVLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZELEtBQUsscUJBQXFCLENBQUMsQ0FBQyxDQUFDO2dCQUN6QixJQUFJLENBQUM7b0JBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDZCQUFnQixHQUFFLENBQUM7b0JBQzFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDWixPQUFPLElBQUEsZUFBSSxFQUFDLCtDQUErQyxDQUFDLENBQUM7b0JBQ2pFLENBQUM7b0JBQ0QsTUFBTSxJQUFJLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUNoRixNQUFNLE9BQU8sR0FBRyxJQUFBLHdCQUFVLEVBQUMsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUMzQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ1gsT0FBTyxJQUFBLGVBQUksRUFBQywyREFBMkQsQ0FBQyxDQUFDO29CQUM3RSxDQUFDO29CQUNELE1BQU0sRUFBRSxHQUFHLGFBQWEsQ0FBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUN6RCxPQUFPLElBQUEsYUFBRSxFQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RSxDQUFDO2dCQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sSUFBQSxlQUFJLEVBQUMsd0JBQXdCLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDdkUsQ0FBQztZQUNMLENBQUM7WUFDRCxLQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQztnQkFDckIsSUFBSSxDQUFDO29CQUNELE1BQU0sZUFBZSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDaEcsSUFBSSxDQUFDLGVBQWUsSUFBSSxPQUFPLGVBQWUsS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDMUQsT0FBTyxJQUFBLGVBQUksRUFBQyxnREFBZ0QsQ0FBQyxDQUFDO29CQUNsRSxDQUFDO29CQUNELE1BQU0sRUFBRSxHQUFHLG9CQUFvQixDQUFDLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUNwRSxPQUFPLElBQUEsYUFBRSxFQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxDQUFDO2dCQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sSUFBQSxlQUFJLEVBQUMsb0JBQW9CLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbkUsQ0FBQztZQUNMLENBQUM7WUFDRDtnQkFDSSxPQUFPLElBQUEsZUFBSSxFQUFDLHlCQUEwQixJQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUMzRSxDQUFDO0lBQ0wsQ0FBQztJQWVLLEFBQU4sS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBRzNCOztRQUNHLE1BQU0sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxFQUFFLENBQUE7WUFBRSxPQUFPLElBQUEsZUFBSSxFQUFDLDZEQUE2RCxDQUFDLENBQUM7UUFDL0YsTUFBTSxlQUFlLEdBQUcsTUFBTSxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNELElBQUksZUFBZSxDQUFDLFNBQVMsSUFBSSxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQy9ELElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sSUFBQSxlQUFJLEVBQUMsTUFBQSxlQUFlLENBQUMsS0FBSyxtQ0FBSSxrQ0FBa0MsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDNUYsQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQzdELFNBQVM7Z0JBQ1QsVUFBVSxFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM3QixZQUFZLEVBQUUsQ0FBQyxDQUFDLElBQUk7b0JBQ3BCLFlBQVksRUFBRSxDQUFDLENBQUMsSUFBSTtvQkFDcEIsYUFBYSxFQUFFLENBQUMsQ0FBQyxLQUFLO2lCQUN6QixDQUFDLENBQUM7YUFDTixDQUFDLENBQUM7WUFDSCxPQUFPLCtCQUErQixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUVELElBQUksZUFBZSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDN0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRTtnQkFDN0QsU0FBUztnQkFDVCxVQUFVLEVBQUUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7YUFDdEUsQ0FBQyxDQUFDO1lBQ0gsT0FBTywrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBRyxNQUFNLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksT0FBTyxJQUFJLGVBQWU7WUFBRSxPQUFPLElBQUEsZUFBSSxFQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuRSxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLDBCQUEwQixFQUFFO1lBQ3ZFLFFBQVEsRUFBRSxlQUFlLENBQUMsUUFBUTtZQUNsQyxhQUFhLEVBQUUsZUFBZSxDQUFDLGFBQWE7WUFDNUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUk7Z0JBQ2hCLFlBQVksRUFBRSxDQUFDLENBQUMsSUFBSTtnQkFDcEIsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO2FBQ2pCLENBQUMsQ0FBQztTQUNOLENBQUMsQ0FBQztRQUNILE9BQU8sK0JBQStCLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUMxRSxDQUFDO0NBQ0o7QUFyTUQsd0NBcU1DO0FBbExTO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLDZCQUE2QjtRQUNuQyxLQUFLLEVBQUUseUJBQXlCO1FBQ2hDLFdBQVcsRUFBRSwyV0FBMlc7UUFDeFgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7OERBR0Q7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSx5QkFBeUI7UUFDL0IsS0FBSyxFQUFFLDZCQUE2QjtRQUNwQyxXQUFXLEVBQUUsOGVBQThlO1FBQzNmLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSw0Q0FBdUIsQ0FBQyxRQUFRLENBQUMsaUZBQWlGLENBQUM7U0FDakksQ0FBQztLQUNMLENBQUM7MkRBOENEO0FBMkJLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHlCQUF5QjtRQUMvQixLQUFLLEVBQUUsNkJBQTZCO1FBQ3BDLFdBQVcsRUFBRSw4UUFBOFE7UUFDM1IsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsWUFBWSxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxhQUFhLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsQ0FBQztTQUM3SCxDQUFDO0tBQ0wsQ0FBQzsyREFxQ0Q7QUFlSztJQWJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSx5QkFBeUI7UUFDL0IsS0FBSyxFQUFFLG1DQUFtQztRQUMxQyxXQUFXLEVBQUUsc2lCQUFzaUI7UUFDbmpCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSw0Q0FBdUI7WUFDbEMsVUFBVSxFQUFFLFVBQUMsQ0FBQyxLQUFLLENBQUMsVUFBQyxDQUFDLE1BQU0sQ0FBQztnQkFDekIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUU7Z0JBQ2hCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFO2dCQUNoQixLQUFLLEVBQUUsVUFBQyxDQUFDLEdBQUcsRUFBRTthQUNqQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztTQUNyQixDQUFDO0tBQ0wsQ0FBQzsyREEyQ0Q7QUFHTDs7Ozs7O0dBTUc7QUFDSCxTQUFTLGFBQWEsQ0FBQyxTQUFpQixFQUFFLElBQVMsRUFBRSxXQUFvQjtJQUNyRSxNQUFNLEdBQUcsR0FBa0IsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxJQUFJLEdBQUcsRUFBVSxFQUFFLENBQUM7SUFDaEYsY0FBYyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xELE9BQU8sR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDeEMsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsU0FBaUIsRUFBRSxHQUF3QjtJQUNyRSxNQUFNLEtBQUssR0FBYSxDQUFDLFNBQVMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqRSxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUN4QyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxRQUFRLEtBQUssaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM1QixDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxLQUFVO0lBQ2pDLElBQUksS0FBSyxLQUFLLElBQUk7UUFBRSxPQUFPLE1BQU0sQ0FBQztJQUNsQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVE7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUMvQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVE7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUMvQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFNBQVM7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUNqRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN2QixPQUFPLFNBQVMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQztJQUNsRixDQUFDO0lBQ0QsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRO1FBQUUsT0FBTyx5QkFBeUIsQ0FBQztJQUNoRSxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxTQUFpQixFQUFFLFVBQStCLEVBQUUsTUFBMkI7SUFDN0csTUFBTSxHQUFHLEdBQWtCLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxHQUFHLEVBQVUsRUFBRSxDQUFDO0lBQ2hGLE1BQU0sS0FBSyxHQUFhLENBQUMsU0FBUyxjQUFjLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pFLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLGFBQU4sTUFBTSxjQUFOLE1BQU0sR0FBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEYsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUNuQyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0IsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLENBQUMsQ0FBQztRQUNoRCxJQUFJLE9BQU8sSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN6QyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsa0JBQWtCLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxJQUFJLE1BQWMsQ0FBQztRQUNuQixJQUFJLGFBQWlDLENBQUM7UUFDdEMsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNYLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QywyQkFBMkIsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sR0FBRyxRQUFRLENBQUM7WUFDbEIsYUFBYSxHQUFHLFFBQVEsQ0FBQztRQUM3QixDQUFDO2FBQU0sQ0FBQztZQUNKLE1BQU0sR0FBRyxhQUFhLENBQUMsS0FBSyxhQUFMLEtBQUssY0FBTCxLQUFLLEdBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUNELElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUMvRCxNQUFNLEdBQUcsU0FBUyxNQUFNLEdBQUcsQ0FBQztZQUM1QixJQUFJLGFBQWE7Z0JBQUUsYUFBYSxHQUFHLElBQUksYUFBYSxHQUFHLENBQUM7UUFDNUQsQ0FBQztRQUNELE1BQU0sU0FBUyxHQUFHLHVCQUF1QixDQUFDLEtBQUssRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNoRSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ1osS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMvRCxDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxJQUFZO0lBQ3RDLE9BQU8sa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNsRSxDQUFDO0FBRUQsS0FBSyxVQUFVLGNBQWMsQ0FBQyxFQUFVOztJQUNwQyxJQUFJLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzFDLENBQUM7SUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1FBQ2hCLE9BQU8sRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsS0FBSyxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUM7SUFDMUYsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLFNBQTRCO0lBQ3RELE9BQU8sT0FBTyxTQUFTLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNyRixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsU0FBNEI7SUFDakQsTUFBTSxDQUFDLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQztJQUN6QixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFLLE1BQU0sSUFBSSxDQUFDLEtBQUssU0FBUyxDQUFDO0FBQ2pFLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxTQUFjLEVBQUUsU0FBNEI7O0lBQ2hFLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFBLE1BQUEsU0FBUyxDQUFDLElBQUksMENBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsS0FBSSxTQUFTLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQyxRQUFRLElBQUksT0FBTyxDQUFDLENBQUM7SUFDOUcsT0FBTyxjQUFjLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNwRCxDQUFDO0FBRUQsS0FBSyxVQUFVLHNCQUFzQixDQUFDLFNBQTRCO0lBQzlELE1BQU0sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELElBQUksS0FBSztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ3hCLElBQUksU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDcEYsSUFBSSxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwRixJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxFQUFFLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNyRSxDQUFDO1FBQ0wsQ0FBQztRQUFDLFdBQU0sQ0FBQztZQUNMLDZDQUE2QztRQUNqRCxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU8sRUFBRSxLQUFLLEVBQUUsNEVBQTRFLFNBQVMsQ0FBQyxFQUFFLDRIQUE0SCxFQUFFLENBQUM7QUFDM08sQ0FBQztBQUVELEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxhQUFxQjs7SUFDckQsSUFBSSxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN0RSxNQUFNLEtBQUssR0FBVSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUQsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMzQixNQUFNLFFBQVEsR0FBRyxJQUFBLHdCQUFVLEVBQUMsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxRQUFRO2dCQUFFLFNBQVM7WUFDeEIsSUFBSSxDQUFDO2dCQUNELE1BQU0sSUFBSSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDaEYsTUFBTSxLQUFLLEdBQVUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDMUUsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxJQUFJLEdBQUcsSUFBQSx3QkFBVSxFQUFDLE1BQUEsTUFBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSywwQ0FBRSxJQUFJLG1DQUFJLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLENBQUMsQ0FBQztvQkFDekQsSUFBSSxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7d0JBQ3pCLE9BQU87NEJBQ0gsUUFBUTs0QkFDUixhQUFhLEVBQUUsTUFBTSxDQUFDLE1BQUEsTUFBQSxNQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxRQUFRLG1DQUFJLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxHQUFHLG1DQUFJLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLG1DQUFJLGNBQWMsQ0FBQzt5QkFDckYsQ0FBQztvQkFDTixDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1lBQUMsV0FBTSxDQUFDO2dCQUNMLDZCQUE2QjtZQUNqQyxDQUFDO1lBQ0QsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxRQUFRLENBQUM7Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRSxDQUFDO0lBQ0wsQ0FBQztJQUFDLFdBQU0sQ0FBQztRQUNMLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUywrQkFBK0IsQ0FDcEMsSUFBa0IsRUFDbEIsSUFBb0MsRUFDcEMsU0FBNEQ7O0lBRTVELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBQSxJQUFJLENBQUMsSUFBSSwwQ0FBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNoRixNQUFNLE9BQU8sR0FBRyxVQUFVO1FBQ3RCLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBTSxFQUFFLENBQVMsRUFBRSxFQUFFOztZQUFDLE9BQUEsQ0FBQztnQkFDckMsSUFBSSxFQUFFLE1BQUEsTUFBQSxNQUFBLENBQUMsQ0FBQyxJQUFJLG1DQUFJLENBQUMsQ0FBQyxRQUFRLG1DQUFJLENBQUMsQ0FBQyxZQUFZLG1DQUFJLE1BQUEsU0FBUyxDQUFDLENBQUMsQ0FBQywwQ0FBRSxJQUFJO2dCQUNsRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPO2dCQUNwQixLQUFLLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQUEsQ0FBQyxDQUFDLEtBQUssbUNBQUksU0FBUyxDQUFDO2dCQUNyRCxPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU87YUFDckIsQ0FBQyxDQUFBO1NBQUEsQ0FBQztRQUNILENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFOztZQUFDLE9BQUEsQ0FBQztnQkFDbEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO2dCQUNaLE9BQU8sRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU87Z0JBQ3ZCLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBQSxNQUFBLElBQUksQ0FBQyxLQUFLLG1DQUFJLElBQUksQ0FBQyxPQUFPLG1DQUFJLFNBQVMsQ0FBQzthQUM5RSxDQUFDLENBQUE7U0FBQSxDQUFDLENBQUM7SUFDUixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDbEUsTUFBTSxRQUFRLEdBQWlCO1FBQzNCLE9BQU8sRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQzVDLElBQUksRUFBRTtZQUNGLElBQUk7WUFDSixLQUFLLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDckIsV0FBVztZQUNYLE9BQU87WUFDUCxTQUFTLEVBQUUsSUFBSSxDQUFDLElBQUk7U0FDdkI7UUFDRCxPQUFPLEVBQUUsV0FBVyxLQUFLLENBQUM7WUFDdEIsQ0FBQyxDQUFDLFNBQVMsT0FBTyxDQUFDLE1BQU0sSUFBSSxJQUFJLGFBQWE7WUFDOUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxJQUFJLE9BQU8sQ0FBQyxNQUFNLElBQUksSUFBSSx5QkFBeUI7S0FDMUUsQ0FBQztJQUNGLElBQUksSUFBSSxDQUFDLE9BQU87UUFBRSxRQUFRLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPO1FBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxNQUFBLE1BQUEsSUFBSSxDQUFDLEtBQUssbUNBQUksSUFBSSxDQUFDLE9BQU8sbUNBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQztJQUN2RixPQUFPLFFBQVEsQ0FBQztBQUNwQixDQUFDO0FBWUQsU0FBUyxjQUFjLENBQUMsR0FBa0IsRUFBRSxTQUFpQixFQUFFLElBQVMsRUFBRSxXQUFvQjs7SUFDMUYsTUFBTSxhQUFhLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxTQUFTLGFBQVQsU0FBUyxjQUFULFNBQVMsR0FBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkYsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUM7UUFBRSxPQUFPO0lBQ2hELEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBRXBDLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUMzQixLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFFakYsSUFBSSxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDbkMsS0FBSyxNQUFNLFFBQVEsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdkMsSUFBSSx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO2dCQUFFLFNBQVM7WUFDcEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pDLElBQUksU0FBUyxLQUFLLFNBQVMsSUFBSSxTQUFTLEtBQUssSUFBSTtnQkFBRSxTQUFTO1lBQzVELDhFQUE4RTtZQUM5RSxvRUFBb0U7WUFDcEUsSUFBSSxPQUFPLFNBQVMsS0FBSyxRQUFRLElBQUksU0FBUyxDQUFDLE9BQU8sS0FBSyxLQUFLO2dCQUFFLFNBQVM7WUFFM0UsTUFBTSxRQUFRLEdBQUcscUJBQXFCLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDaEYsTUFBTSxRQUFRLEdBQUcsQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsUUFBUSxFQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4RCxNQUFNLFVBQVUsR0FBdUIsU0FBUyxhQUFULFNBQVMsdUJBQVQsU0FBUyxDQUFFLE9BQU8sQ0FBQztZQUMxRCxNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDNUMsSUFBSSxPQUFPLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ3pDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDNUQsQ0FBQztZQUNELE1BQU0sU0FBUyxHQUFHLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDN0UsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDWixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4RixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sUUFBUSxHQUFHLFlBQVksS0FBSyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVELElBQUksQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDOUUsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNmLEtBQUssQ0FBQyxJQUFJLENBQUMscUhBQXFILENBQUMsQ0FBQztRQUNsSSxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQyxNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsTUFBQSxNQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxRQUFRLG1DQUFJLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLG1DQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDcEYsTUFBTSxLQUFLLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUEsd0JBQVUsRUFBQyxNQUFBLE1BQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssMENBQUUsSUFBSSxtQ0FBSSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzRixLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxVQUFVLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDbkQsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsa0VBQWtFO0FBQ2xFLHFFQUFxRTtBQUNyRSxnRUFBZ0U7QUFDaEUsNkJBQTZCO0FBQzdCLFNBQVMsa0JBQWtCLENBQUMsSUFBWTtJQUNwQyxPQUFPLElBQUk7U0FDTixPQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztTQUN4QixPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQztTQUN0QixPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFFRCxvRUFBb0U7QUFDcEUsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSxTQUFTLGtCQUFrQixDQUFDLElBQVk7SUFDcEMsT0FBTyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsR0FBa0IsRUFBRSxjQUFzQixFQUFFLFFBQWdCLEVBQUUsS0FBVTs7SUFDbkcsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sQ0FBQSxDQUFDO0lBQ2pDLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDMUQsTUFBTSxRQUFRLEdBQUcsTUFBQSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsbUNBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUUsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNYLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxQywyQkFBMkIsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3JELE9BQU87WUFDSCxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRO1lBQ2pELGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVE7U0FDdEQsQ0FBQztJQUNOLENBQUM7SUFFRCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNqRCxJQUFJLFdBQVcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDckYsTUFBTSxVQUFVLEdBQUcscUJBQXFCLENBQUMsY0FBYyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekYsY0FBYyxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELE9BQU87WUFDSCxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVO1lBQ3JELGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLFVBQVU7U0FDMUQsQ0FBQztJQUNOLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQzdELENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxLQUFVOztJQUM3QixJQUFJLEtBQUssS0FBSyxTQUFTLElBQUksS0FBSyxLQUFLLElBQUk7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM1RCxpRUFBaUU7SUFDakUsTUFBTSxFQUFFLEdBQUcsT0FBTyxLQUFLLENBQUM7SUFDeEIsSUFBSSxFQUFFLEtBQUssUUFBUTtRQUFFLE9BQU8sUUFBUSxDQUFDO0lBQ3JDLElBQUksRUFBRSxLQUFLLFFBQVE7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUNyQyxJQUFJLEVBQUUsS0FBSyxTQUFTO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFFdkMsTUFBTSxPQUFPLEdBQVcsTUFBQSxNQUFBLEtBQUssQ0FBQyxJQUFJLG1DQUFJLEtBQUssQ0FBQyxRQUFRLG1DQUFJLEVBQUUsQ0FBQztJQUUzRCxJQUFJLEVBQVUsQ0FBQztJQUNmLFFBQVEsT0FBTyxFQUFFLENBQUM7UUFDZCxLQUFLLFFBQVE7WUFBRSxFQUFFLEdBQUcsUUFBUSxDQUFDO1lBQUMsTUFBTTtRQUNwQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsU0FBUyxDQUFDO1lBQUMsTUFBTTtRQUN0QyxLQUFLLFNBQVMsQ0FBQztRQUNmLEtBQUssT0FBTyxDQUFDO1FBQ2IsS0FBSyxRQUFRO1lBQUUsRUFBRSxHQUFHLFFBQVEsQ0FBQztZQUFDLE1BQU07UUFDcEMsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsUUFBUSxDQUFDO1lBQUMsTUFBTTtRQUNyQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFVBQVU7WUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDO1lBQUMsTUFBTTtRQUNyQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLFNBQVM7WUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQUMsTUFBTTtRQUNuQyxLQUFLLEVBQUU7WUFBRSxFQUFFLEdBQUcsU0FBUyxDQUFDO1lBQUMsTUFBTTtRQUMvQixPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ04sMERBQTBEO1lBQzFELHdEQUF3RDtZQUN4RCxpQ0FBaUM7WUFDakMsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksU0FBUyxDQUFDO1lBQy9FLE1BQU0sV0FBVyxHQUFhLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDaEYsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7bUJBQzlDLE9BQU8sS0FBSyxNQUFNO21CQUNsQixPQUFPLEtBQUssV0FBVzttQkFDdkIsT0FBTyxLQUFLLFNBQVM7bUJBQ3JCLE9BQU8sS0FBSyxjQUFjO21CQUMxQixPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLEVBQUUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDO1FBQzNFLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxFQUFFLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxLQUFVLEVBQUUsWUFBcUI7SUFDOUQsSUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFFckQsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLE1BQU0sUUFBUSxHQUFHLFlBQVksYUFBWixZQUFZLGNBQVosWUFBWSxHQUFJLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sb0JBQW9CLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSTtXQUN2RCxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUM7SUFDekQsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssU0FBUyxJQUFJLG9CQUFvQixDQUFDLElBQUksUUFBUSxFQUFFLENBQUM7UUFDakUsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ2xGLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQixJQUFJLEtBQUssS0FBSyxTQUFTLElBQUksS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3hDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLEtBQUssY0FBYyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUgsQ0FBQztJQUNMLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3BDLE9BQU8sZUFBZSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDaEQsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsS0FBVTtJQUN2QyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxDQUFBLENBQUM7SUFDakMsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUMxRCxNQUFNLE9BQU8sR0FBdUIsU0FBUyxhQUFULFNBQVMsdUJBQVQsU0FBUyxDQUFFLElBQUksQ0FBQztJQUNwRCxJQUFJLENBQUMsT0FBTztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBRTFCLElBQUksSUFBbUIsQ0FBQztJQUN4QixRQUFRLE9BQU8sRUFBRSxDQUFDO1FBQ2QsS0FBSyxTQUFTO1lBQUUsSUFBSSxHQUFHLFdBQVcsQ0FBQztZQUFDLE1BQU07UUFDMUMsS0FBSyxPQUFPLENBQUM7UUFDYixLQUFLLFFBQVE7WUFBRSxJQUFJLEdBQUcsU0FBUyxDQUFDO1lBQUMsTUFBTTtRQUN2QyxLQUFLLFFBQVE7WUFBRSxJQUFJLEdBQUcsUUFBUSxDQUFDO1lBQUMsTUFBTTtRQUN0QyxLQUFLLFNBQVM7WUFBRSxJQUFJLEdBQUcsU0FBUyxDQUFDO1lBQUMsTUFBTTtRQUN4QyxLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssU0FBUztZQUFFLElBQUksR0FBRyxRQUFRLENBQUM7WUFBQyxNQUFNO1FBQ3ZDLE9BQU8sQ0FBQyxDQUFDLElBQUksR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBQ0QsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLElBQUksQ0FBQztJQUN2QixPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3hDLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxLQUFVO0lBQzlCLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtRQUFFLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1RCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTO1FBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEYsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxLQUFVO0lBQy9CLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMxRSxJQUFJLENBQUM7UUFDRCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqRSxPQUFPLFVBQVUsQ0FBQztRQUN0QixDQUFDO0lBQ0wsQ0FBQztJQUFDLFdBQU0sQ0FBQztRQUNMLGtFQUFrRTtJQUN0RSxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDakIsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVU7SUFDOUIsSUFBSSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsZUFBZTtRQUFFLE9BQU8sS0FBSyxDQUFDLGVBQWUsQ0FBQztJQUN6RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakYsT0FBTyxLQUFLLENBQUM7QUFDakIsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsS0FBVTs7SUFDakMsSUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckQsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVE7UUFDakQsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVztZQUN0RCxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxRQUFRLDBDQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVE7Z0JBQ3BFLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFFBQVEsMENBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsV0FBVztvQkFDMUUsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLDJCQUEyQixDQUFDLEdBQWtCLEVBQUUsUUFBZ0IsRUFBRSxLQUFZO0lBQ25GLE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QyxJQUFJLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUFFLE9BQU87SUFDL0MsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFFbkMsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUMxQyxNQUFNLEtBQUssR0FBYSxDQUFDLGNBQWMsWUFBWSxJQUFJLENBQUMsQ0FBQztJQUN6RCxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFOztRQUMxQixNQUFNLE9BQU8sR0FBRyxNQUFBLE1BQUEsTUFBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsSUFBSSxtQ0FBSSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsV0FBVyxtQ0FBSSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxtQ0FBSSxRQUFRLEtBQUssRUFBRSxDQUFDO1FBQ2xGLElBQUksVUFBVSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNqRCxJQUFJLGVBQWUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNsQyxVQUFVLEdBQUcsR0FBRyxVQUFVLElBQUksS0FBSyxFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUNELGVBQWUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQztRQUMxQixNQUFNLFdBQVcsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRO1lBQ3pDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztZQUN2QixDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUTtnQkFDdkIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBQ2YsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sVUFBVSxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxLQUFVO0lBQ2pDLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3JELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDMUIsSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxVQUFVLElBQUksS0FBSyxFQUFFLENBQUM7UUFDckYsT0FBTyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUNELElBQUksVUFBVSxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDNUMsT0FBTyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLGNBQXNCLEVBQUUsUUFBZ0IsRUFBRSxLQUFVLEVBQUUsT0FBZ0I7O0lBQ2pHLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsUUFBUSxtQ0FBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDcEYsSUFBSSxRQUFRLElBQUksUUFBUSxLQUFLLFVBQVUsSUFBSSxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDL0QsT0FBTyxRQUFRLENBQUM7SUFDcEIsQ0FBQztJQUNELE9BQU8sY0FBYyxDQUFDLEdBQUcsY0FBYyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUN0RyxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxJQUF3QjtJQUMvQyxPQUFPLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxVQUFVO1dBQ25CLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTO1dBQ2xCLElBQUksS0FBSyxTQUFTLENBQUM7QUFDOUIsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsS0FBVTs7SUFDaEMsSUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDdEQsTUFBTSxPQUFPLEdBQVcsTUFBQSxNQUFBLEtBQUssQ0FBQyxJQUFJLG1DQUFJLEtBQUssQ0FBQyxRQUFRLG1DQUFJLEVBQUUsQ0FBQztJQUMzRCxNQUFNLFdBQVcsR0FBYSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2hGLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7V0FDakMsT0FBTyxLQUFLLE1BQU07V0FDbEIsT0FBTyxLQUFLLFdBQVc7V0FDdkIsT0FBTyxLQUFLLFNBQVM7V0FDckIsT0FBTyxLQUFLLGNBQWM7V0FDMUIsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN0RSxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsSUFBWTtJQUNoQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxhQUFKLElBQUksY0FBSixJQUFJLEdBQUksRUFBRSxDQUFDO1NBQzNCLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxPQUFPLENBQUM7U0FDdEMsS0FBSyxDQUFDLGVBQWUsQ0FBQztTQUN0QixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckIsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFGLE9BQU8sY0FBYyxDQUFDLE1BQU0sSUFBSSxJQUFJLElBQUksT0FBTyxDQUFDLENBQUM7QUFDckQsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLElBQVM7O0lBQzlCLElBQUksQ0FBQyxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ3BELE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFBLE1BQUEsSUFBSSxDQUFDLFFBQVEsbUNBQUksSUFBSSxDQUFDLElBQUksbUNBQUksRUFBRSxDQUFDLENBQUM7SUFDekQsSUFBSSxPQUFPLEtBQUssTUFBTSxJQUFJLE9BQU8sS0FBSyxTQUFTO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDOUQsTUFBTSxXQUFXLEdBQWEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUM5RSxPQUFPLFdBQVcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNsRixDQUFDO0FBRUQscUVBQXFFO0FBQ3JFLHFFQUFxRTtBQUNyRSxvRUFBb0U7QUFDcEUsb0VBQW9FO0FBQ3BFLHVEQUF1RDtBQUN2RCxTQUFTLGNBQWMsQ0FBQyxJQUFZO0lBQ2hDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLGFBQUosSUFBSSxjQUFKLElBQUksR0FBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbEUsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUM7UUFBRSxPQUFPLFVBQVUsQ0FBQztJQUM1QyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQUUsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBQ2pELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG4vKipcbiAqIGluc3BlY3Rvci10b29scyDigJQgVHlwZVNjcmlwdCBjbGFzcy1kZWZpbml0aW9uIGdlbmVyYXRvciBiYWNrZWQgYnlcbiAqIGNvY29zIGBzY2VuZS9xdWVyeS1ub2RlYCBkdW1wcy5cbiAqXG4gKiBUd28gTUNQIHRvb2xzOlxuICogICAtIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiAg4oCUIGZvciBhICoqbm9kZSoqIG9yXG4gKiAgICAgY29tcG9uZW50IHJlZmVyZW5jZSwgd2FsayB0aGUgY29jb3MgZHVtcCBhbmQgZW1pdCBhIFR5cGVTY3JpcHRcbiAqICAgICBjbGFzcyBkZWNsYXJhdGlvbiBBSSBjYW4gcmVhZCBiZWZvcmUgY2hhbmdpbmcgcHJvcGVydGllcy4gQXZvaWRzXG4gKiAgICAgdGhlIFwiQUkgZ3Vlc3NlcyBwcm9wZXJ0eSBuYW1lXCIgZmFpbHVyZSBtb2RlLlxuICogICAtIGluc3BlY3Rvcl9nZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24g4oCUIHJldHVybiBoYXJkY29kZWRcbiAqICAgICBkZWZpbml0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgZXRjLilcbiAqICAgICB0aGF0IHRoZSBpbnN0YW5jZSBkZWZpbml0aW9uIHJlZmVyZW5jZXMgYnV0IGRvZXNuJ3QgaW5saW5lLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtY29kZS1tb2RlIChSb21hUm9nb3YpXG4gKiBgRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvY29jb3MtY29kZS1tb2RlL3NvdXJjZS91dGNwL3Rvb2xzL3R5cGVzY3JpcHQtZGVmZW5pdGlvbi50c2AuXG4gKiBPdXIgaW1wbCB3YWxrcyBwcm9wZXJ0eSBkdW1wcywgZGVjb3JhdG9ycywgZW51bS9CaXRNYXNrIG1ldGFkYXRhLFxuICogbmVzdGVkIHN0cnVjdHMsIGFycmF5cywgYW5kIHJlZmVyZW5jZXMuXG4gKlxuICogRGVtb25zdHJhdGVzIHRoZSBAbWNwVG9vbCBkZWNvcmF0b3IgKHYyLjQuMCBzdGVwIDUpLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgSW5zdGFuY2VSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcbmltcG9ydCB7IEFzc2V0TWV0YVRvb2xzIH0gZnJvbSAnLi9hc3NldC1tZXRhLXRvb2xzJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgTm9kZVRvb2xzIH0gZnJvbSAnLi9ub2RlLXRvb2xzJztcbmltcG9ydCB7IGR1bXBVbndyYXAgfSBmcm9tICcuLi9saWIvZHVtcC11bndyYXAnO1xuaW1wb3J0IHsgZ2V0U2NlbmVSb290VXVpZCB9IGZyb20gJy4uL2xpYi9zY2VuZS1yb290JztcblxuY29uc3QgQ09NTU9OX1RZUEVTX0RFRklOSVRJT04gPSBgLy8gQ29jb3MgY29tbW9uIHZhbHVlIHR5cGVzIOKAlCByZWZlcmVuY2VkIGJ5IGluc3RhbmNlIGRlZmluaXRpb25zLlxudHlwZSBJbnN0YW5jZVJlZmVyZW5jZTxUID0gdW5rbm93bj4gPSB7IGlkOiBzdHJpbmc7IHR5cGU/OiBzdHJpbmcgfTtcbmNsYXNzIFZlYzIgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgfVxuY2xhc3MgVmVjMyB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH1cbmNsYXNzIFZlYzQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIENvbG9yIHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyOyB9XG5jbGFzcyBSZWN0IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9XG5jbGFzcyBTaXplIHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFF1YXQgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IH1cbmNsYXNzIE1hdDMgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyO1xuICBtMDM6IG51bWJlcjsgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyO1xuICBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7IG0wODogbnVtYmVyOyB9XG5jbGFzcyBNYXQ0IHsgbTAwOiBudW1iZXI7IG0wMTogbnVtYmVyOyBtMDI6IG51bWJlcjsgbTAzOiBudW1iZXI7XG4gIG0wNDogbnVtYmVyOyBtMDU6IG51bWJlcjsgbTA2OiBudW1iZXI7IG0wNzogbnVtYmVyO1xuICBtMDg6IG51bWJlcjsgbTA5OiBudW1iZXI7IG0xMDogbnVtYmVyOyBtMTE6IG51bWJlcjtcbiAgbTEyOiBudW1iZXI7IG0xMzogbnVtYmVyOyBtMTQ6IG51bWJlcjsgbTE1OiBudW1iZXI7IH1cbmA7XG5cbi8vIE5hbWVzIHRoYXQgc2hvdyB1cCBhdCB0aGUgdG9wIG9mIGV2ZXJ5IG5vZGUgZHVtcCBidXQgYXJlbid0XG4vLyB1c2VyLWZhY2luZyBwcm9wZXJ0aWVzOyBzdXBwcmVzcyBmcm9tIGdlbmVyYXRlZCBkZWZpbml0aW9ucy5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjb2RleCk6IGV4cGFuZGVkIGZyb20gdGhlIHYyLjQuMCBtaW5pbWFsIGxpc3QgdG9cbi8vIGNvdmVyIHByZWZhYi1pbnN0YW5jZS9zZXJpYWxpemF0aW9uIG1ldGFkYXRhIGFuZCBlZGl0b3Itb25seSBmaWVsZHNcbi8vIHRoYXQgQUkgc2hvdWxkbid0IHRyeSB0byBtdXRhdGUuXG4vL1xuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4K2NsYXVkZStnZW1pbmkpOiBDT01QT05FTlRfSU5URVJOQUxfS0VZUyB3YXNcbi8vIHJlbW92ZWQgYWZ0ZXIgZHJpZnRpbmcgb3V0IG9mIHN5bmMgd2l0aCBjb2NvcyBlZGl0b3IuIFRoZSBzaGFyZWRcbi8vIHJlbmRlcmVyIGtlZXBzIHRoaXMgY29uc2VydmF0aXZlIG5vZGUgbWV0YWRhdGEgZmlsdGVyIGZvciBib3RoIG5vZGVcbi8vIGFuZCBjb21wb25lbnQtc2hhcGVkIGR1bXBzLlxuY29uc3QgTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVMgPSBuZXcgU2V0KFtcbiAgICAnX190eXBlX18nLCAnX19jb21wc19fJywgJ19fcHJlZmFiX18nLCAnX19lZGl0b3JFeHRyYXNfXycsXG4gICAgJ19vYmpGbGFncycsICdfaWQnLCAndXVpZCcsXG4gICAgJ2NoaWxkcmVuJywgJ3BhcmVudCcsXG4gICAgJ19wcmVmYWJJbnN0YW5jZScsICdfcHJlZmFiJywgJ21vdW50ZWRSb290JywgJ21vdW50ZWRDaGlsZHJlbicsXG4gICAgJ3JlbW92ZWRDb21wb25lbnRzJywgJ19jb21wb25lbnRzJyxcbl0pO1xuXG5leHBvcnQgY2xhc3MgSW5zcGVjdG9yVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgYXNzZXRNZXRhVG9vbHMgPSBuZXcgQXNzZXRNZXRhVG9vbHMoKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbXBvbmVudFRvb2xzID0gbmV3IENvbXBvbmVudFRvb2xzKCk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBub2RlVG9vbHMgPSBuZXcgTm9kZVRvb2xzKCk7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgY29jb3MgY29tbW9uIHR5cGVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmV0dXJuIGhhcmRjb2RlZCBUeXBlU2NyaXB0IGRlY2xhcmF0aW9ucyBmb3IgY29jb3MgdmFsdWUgdHlwZXMgKFZlYzIvMy80LCBDb2xvciwgUmVjdCwgU2l6ZSwgUXVhdCwgTWF0My80KSBhbmQgdGhlIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLiBBSSBjYW4gcHJlcGVuZCB0aGlzIHRvIGluc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbiBvdXRwdXQgYmVmb3JlIGdlbmVyYXRpbmcgdHlwZS1zYWZlIGNvZGUuIE5vIHNjZW5lIHF1ZXJ5LiBTdXBwb3J0cyBib3RoIG5vZGUgYW5kIGNvbXBvbmVudCBpbnN0YW5jZSBkdW1wcyBpbmNsdWRpbmcgQHByb3BlcnR5IGRlY29yYXRvcnMgYW5kIGVudW0gdHlwZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldENvbW1vblR5cGVzRGVmaW5pdGlvbigpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gb2soeyBkZWZpbml0aW9uOiBDT01NT05fVFlQRVNfREVGSU5JVElPTiB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfaW5zdGFuY2VfZGVmaW5pdGlvbicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBpbnN0YW5jZSBUUyBkZWZpbml0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gR2VuZXJhdGUgYSBUeXBlU2NyaXB0IGNsYXNzIGRlY2xhcmF0aW9uIGZvciBhIHNjZW5lIG5vZGUsIGRlcml2ZWQgZnJvbSB0aGUgbGl2ZSBjb2NvcyBzY2VuZS9xdWVyeS1ub2RlIGR1bXAuIFRoZSBnZW5lcmF0ZWQgY2xhc3MgaW5jbHVkZXMgYSBjb21tZW50IGxpc3RpbmcgdGhlIGNvbXBvbmVudHMgYXR0YWNoZWQgdG8gdGhlIG5vZGUgKHdpdGggVVVJRHMpLiBBSSBzaG91bGQgY2FsbCB0aGlzIEJFRk9SRSB3cml0aW5nIHByb3BlcnRpZXMgc28gaXQgc2VlcyB0aGUgcmVhbCBwcm9wZXJ0eSBuYW1lcyArIHR5cGVzIGluc3RlYWQgb2YgZ3Vlc3NpbmcuIFBhaXIgd2l0aCBnZXRfY29tbW9uX3R5cGVzX2RlZmluaXRpb24gZm9yIFZlYzIvQ29sb3IvZXRjIHJlZmVyZW5jZXMuIFN1cHBvcnRzIGJvdGggbm9kZSBhbmQgY29tcG9uZW50IGluc3RhbmNlIGR1bXBzIGluY2x1ZGluZyBAcHJvcGVydHkgZGVjb3JhdG9ycyBhbmQgZW51bSB0eXBlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgb3IgY29tcG9uZW50LiB7aWR9ID0gaW5zdGFuY2UgVVVJRCwge3R5cGV9IG9wdGlvbmFsIGNjIGNsYXNzIGxhYmVsLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEluc3RhbmNlRGVmaW5pdGlvbihhcmdzOiB7IHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgcmVmZXJlbmNlIH0gPSBhcmdzO1xuICAgICAgICBpZiAoIXJlZmVyZW5jZT8uaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdpbnNwZWN0b3JfZ2V0X2luc3RhbmNlX2RlZmluaXRpb246IHJlZmVyZW5jZS5pZCBpcyByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFzc2V0SW5mb1Jlc3VsdCA9IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKHJlZmVyZW5jZS5pZCk7XG4gICAgICAgIGlmIChhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvIHx8IGlzQXNzZXRSZWZlcmVuY2VIaW50KHJlZmVyZW5jZSkpIHtcbiAgICAgICAgICAgIGlmICghYXNzZXRJbmZvUmVzdWx0LmFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGFzc2V0SW5mb1Jlc3VsdC5lcnJvciA/PyBgaW5zcGVjdG9yOiBhc3NldCBub3QgZm91bmQgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEFzc2V0SW5zdGFuY2VEZWZpbml0aW9uKHJlZmVyZW5jZSwgYXNzZXRJbmZvUmVzdWx0LmFzc2V0SW5mbyk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCByZWZlcmVuY2UuaWQpO1xuICAgICAgICAgICAgaWYgKCFkdW1wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGluc3BlY3RvcjogcXVlcnktbm9kZSByZXR1cm5lZCBubyBkdW1wIGZvciAke3JlZmVyZW5jZS5pZH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0cnVzdCB0aGUgZHVtcCdzIF9fdHlwZV9fLCBub3RcbiAgICAgICAgICAgIC8vIHRoZSBjYWxsZXItc3VwcGxpZWQgcmVmZXJlbmNlLnR5cGUuIEEgY2FsbGVyIHBhc3NpbmdcbiAgICAgICAgICAgIC8vIHtpZDogbm9kZVV1aWQsIHR5cGU6ICdjYy5TcHJpdGUnfSBvdGhlcndpc2UgZ290IGEgbm9kZVxuICAgICAgICAgICAgLy8gZHVtcCByZW5kZXJlZCBhcyBgY2xhc3MgU3ByaXRlYCwgbWlzbGFiZWxsaW5nIHRoZVxuICAgICAgICAgICAgLy8gZGVjbGFyYXRpb24gZW50aXJlbHkuIHJlZmVyZW5jZS50eXBlIGlzIG5vdyBkaWFnbm9zdGljXG4gICAgICAgICAgICAvLyBvbmx5IOKAlCBzdXJmYWNlZCBpbiB0aGUgcmVzcG9uc2UgZGF0YSBzbyBjYWxsZXJzIGNhbiBzZWVcbiAgICAgICAgICAgIC8vIGEgbWlzbWF0Y2ggYnV0IG5ldmVyIHVzZWQgYXMgdGhlIGNsYXNzIG5hbWUuXG4gICAgICAgICAgICBjb25zdCBkdW1wVHlwZSA9IFN0cmluZyhkdW1wLl9fdHlwZV9fID8/IGR1bXAudHlwZSA/PyAnQ29jb3NJbnN0YW5jZScpO1xuICAgICAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gZHVtcFR5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpO1xuICAgICAgICAgICAgY29uc3QgcmVmZXJlbmNlVHlwZU1pc21hdGNoID0gcmVmZXJlbmNlLnR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZSAhPT0gZHVtcFR5cGVcbiAgICAgICAgICAgICAgICAmJiByZWZlcmVuY2UudHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykgIT09IGNsYXNzTmFtZTtcbiAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcyhjbGFzc05hbWUsIGR1bXAsIGlzQ29tcG9uZW50RHVtcChkdW1wKSk7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZTogVG9vbFJlc3BvbnNlID0ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IHsgaWQ6IHJlZmVyZW5jZS5pZCwgdHlwZTogZHVtcC5fX3R5cGVfXyA/PyByZWZlcmVuY2UudHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICBraW5kOiBpc0NvbXBvbmVudER1bXAoZHVtcCkgPyAnY29tcG9uZW50JyA6ICdub2RlJyxcbiAgICAgICAgICAgICAgICAgICAgZGVmaW5pdGlvbjogdHMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVmZXJlbmNlVHlwZU1pc21hdGNoKSB7XG4gICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZyA9IGBpbnNwZWN0b3I6IHJlZmVyZW5jZS50eXBlICgke3JlZmVyZW5jZS50eXBlfSkgZG9lcyBub3QgbWF0Y2ggZHVtcCBfX3R5cGVfXyAoJHtkdW1wVHlwZX0pOyBjbGFzcyBsYWJlbCB1c2VzIHRoZSBkdW1wIHZhbHVlYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBpbnNwZWN0b3I6IHF1ZXJ5LW5vZGUgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QXNzZXRJbnN0YW5jZURlZmluaXRpb24ocmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSwgYXNzZXRJbmZvOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5hc3NldE1ldGFUb29scy5leGVjdXRlKCdnZXRfcHJvcGVydGllcycsIHtcbiAgICAgICAgICAgIHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGluY2x1ZGVUb29sdGlwczogdHJ1ZSxcbiAgICAgICAgICAgIHVzZUFkdmFuY2VkSW5zcGVjdGlvbjogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIXJlc3Auc3VjY2VzcykgcmV0dXJuIHJlc3A7XG4gICAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IGAke2Fzc2V0Q2xhc3NOYW1lKGFzc2V0SW5mbywgcmVmZXJlbmNlKX1JbXBvcnRlcmA7XG4gICAgICAgIGNvbnN0IHRzID0gcmVuZGVyQXNzZXRJbXBvcnRlckNsYXNzKGNsYXNzTmFtZSwgcmVzcC5kYXRhPy5wcm9wZXJ0aWVzID8/IHt9LCByZXNwLmRhdGE/LmFycmF5cyA/PyB7fSk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IHsgaWQ6IHJlZmVyZW5jZS5pZCwgdHlwZTogcmVmZXJlbmNlLnR5cGUgPz8gYXNzZXRJbmZvLnR5cGUgfSxcbiAgICAgICAgICAgIGtpbmQ6ICdhc3NldCcsXG4gICAgICAgICAgICBpbXBvcnRlcjogYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgZGVmaW5pdGlvbjogdHMsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zZXR0aW5nc19kZWZpbml0aW9uJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHNldHRpbmdzIFRTIGRlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGVkaXRvciBzZXR0aW5ncyBkdW1wcy4gc2V0dGluZ3NUeXBlIHNlbGVjdHMgd2hpY2ggZHVtcDogQ29tbW9uVHlwZXMgcmV0dXJucyB0aGUgY29tbW9uIGNvY29zIHZhbHVlIHR5cGVzOyBDdXJyZW50U2NlbmVHbG9iYWxzIGR1bXBzIGN1cnJlbnQgc2NlbmUgZ2xvYmFsczsgUHJvamVjdFNldHRpbmdzIGR1bXBzIGNvY29zIHByb2plY3Qgc2V0dGluZ3MgY2F0ZWdvcmllcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc2V0dGluZ3NUeXBlOiB6LmVudW0oWydDb21tb25UeXBlcycsICdDdXJyZW50U2NlbmVHbG9iYWxzJywgJ1Byb2plY3RTZXR0aW5ncyddKS5kZXNjcmliZSgnV2hpY2ggc2V0dGluZ3MgZHVtcCB0byByZW5kZXIuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0U2V0dGluZ3NEZWZpbml0aW9uKGFyZ3M6IHsgc2V0dGluZ3NUeXBlOiAnQ29tbW9uVHlwZXMnIHwgJ0N1cnJlbnRTY2VuZUdsb2JhbHMnIHwgJ1Byb2plY3RTZXR0aW5ncycgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHN3aXRjaCAoYXJncy5zZXR0aW5nc1R5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0NvbW1vblR5cGVzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBkZWZpbml0aW9uOiBDT01NT05fVFlQRVNfREVGSU5JVElPTiB9KTtcbiAgICAgICAgICAgIGNhc2UgJ0N1cnJlbnRTY2VuZUdsb2JhbHMnOiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9vdFV1aWQgPSBhd2FpdCBnZXRTY2VuZVJvb3RVdWlkKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdDdXJyZW50U2NlbmVHbG9iYWxzOiBubyBzY2VuZSByb290IG5vZGUgZm91bmQnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgcm9vdFV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBnbG9iYWxzID0gZHVtcFVud3JhcChkdW1wPy5fZ2xvYmFscyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZ2xvYmFscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0N1cnJlbnRTY2VuZUdsb2JhbHM6IG5vIF9nbG9iYWxzIGZvdW5kIG9uIHNjZW5lIHJvb3Qgbm9kZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcygnU2NlbmVHbG9iYWxzJywgZ2xvYmFscywgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBkZWZpbml0aW9uOiB0cywgc2V0dGluZ3NUeXBlOiAnQ3VycmVudFNjZW5lR2xvYmFscycgfSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEN1cnJlbnRTY2VuZUdsb2JhbHM6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ1Byb2plY3RTZXR0aW5ncyc6IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0U2V0dGluZ3M6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgJ3Byb2plY3QnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0U2V0dGluZ3MgfHwgdHlwZW9mIHByb2plY3RTZXR0aW5ncyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdQcm9qZWN0U2V0dGluZ3M6IHF1ZXJ5LWNvbmZpZyByZXR1cm5lZCBubyBkYXRhJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJQbGFpbkpzb25DbGFzcygnUHJvamVjdFNldHRpbmdzJywgcHJvamVjdFNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9rKHsgZGVmaW5pdGlvbjogdHMsIHNldHRpbmdzVHlwZTogJ1Byb2plY3RTZXR0aW5ncycgfSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFByb2plY3RTZXR0aW5nczogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBzZXR0aW5nc1R5cGU6ICR7KGFyZ3MgYXMgYW55KS5zZXR0aW5nc1R5cGV9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfaW5zdGFuY2VfcHJvcGVydGllcycsXG4gICAgICAgIHRpdGxlOiAnU2V0IGluc3RhbmNlIHByb3BlcnRpZXMgKGdlbmVyaWMpJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gR2VuZXJpYyBiYXRjaCBwcm9wZXJ0eSB3cml0ZXIgdGhhdCBkaXNwYXRjaGVzIHRvIHRoZSByaWdodCBzZXR0ZXIgYmFzZWQgb24gaW5zdGFuY2Uga2luZC4gcmVmZXJlbmNlLnR5cGUgcHJlZml4IHJvdXRlczogYXNzZXQ6KiDihpIgYXNzZXRNZXRhIHBhdGggKGludGVycHJldGVyLXZhbGlkYXRlZCk7IGNjLkNvbXBvbmVudCAvIGNvbXBvbmVudCBjaWQg4oaSIGNvbXBvbmVudCBwYXRoOyBjYy5Ob2RlIOKGkiBub2RlIHBhdGguIEZvciBzaW5nbGUta2luZCB3b3JrLCB0aGUgc3BlY2lmaWMgdG9vbHMgKGNvbXBvbmVudF9zZXRfY29tcG9uZW50X3Byb3BlcnR5IC8gYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIC8gbm9kZV9zZXRfbm9kZV9wcm9wZXJ0eSkgYXJlIHN0aWxsIHByZWZlcnJlZDsgdXNlIHRoaXMgZm9yIGhldGVyb2dlbmVvdXMgYmF0Y2hlcy4gTm90ZToga2luZC1zcGVjaWZpYyBvcHRpb25zIGxpa2UgcHJlc2VydmVDb250ZW50U2l6ZSBhcmUgbm90IGF2YWlsYWJsZSBoZXJlIOKAlCB1c2UgdGhlIGRlZGljYXRlZCB0b29scyBmb3IgdGhvc2UuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLFxuICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCksXG4gICAgICAgICAgICB9KSkubWluKDEpLm1heCg1MCksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0SW5zdGFuY2VQcm9wZXJ0aWVzKGFyZ3M6IHtcbiAgICAgICAgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZTtcbiAgICAgICAgcHJvcGVydGllczogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueSB9PjtcbiAgICB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UsIHByb3BlcnRpZXMgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9zZXRfaW5zdGFuY2VfcHJvcGVydGllczogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIGNvbnN0IGFzc2V0SW5mb1Jlc3VsdCA9IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKHJlZmVyZW5jZS5pZCk7XG4gICAgICAgIGlmIChhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvIHx8IGlzQXNzZXRSZWZlcmVuY2VIaW50KHJlZmVyZW5jZSkpIHtcbiAgICAgICAgICAgIGlmICghYXNzZXRJbmZvUmVzdWx0LmFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGFzc2V0SW5mb1Jlc3VsdC5lcnJvciA/PyBgaW5zcGVjdG9yOiBhc3NldCBub3QgZm91bmQgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFzc2V0TWV0YVRvb2xzLmV4ZWN1dGUoJ3NldF9wcm9wZXJ0aWVzJywge1xuICAgICAgICAgICAgICAgIHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdhc3NldCcsIHByb3BlcnRpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzTm9kZVJlZmVyZW5jZShyZWZlcmVuY2UpKSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5ub2RlVG9vbHMuZXhlY3V0ZSgnc2V0X25vZGVfcHJvcGVydGllcycsIHtcbiAgICAgICAgICAgICAgICByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllcy5tYXAocCA9PiAoeyBwYXRoOiBwLnBhdGgsIHZhbHVlOiBwLnZhbHVlIH0pKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZURlbGVnYXRlZEJhdGNoUmVzcG9uc2UocmVzcCwgJ25vZGUnLCBwcm9wZXJ0aWVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudFRhcmdldCA9IGF3YWl0IHJlc29sdmVDb21wb25lbnRUYXJnZXQocmVmZXJlbmNlKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gY29tcG9uZW50VGFyZ2V0KSByZXR1cm4gZmFpbChjb21wb25lbnRUYXJnZXQuZXJyb3IpO1xuICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdzZXRfY29tcG9uZW50X3Byb3BlcnRpZXMnLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY29tcG9uZW50VGFyZ2V0Lm5vZGVVdWlkLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogY29tcG9uZW50VGFyZ2V0LmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHk6IHAucGF0aCxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdjb21wb25lbnQnLCBwcm9wZXJ0aWVzKTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgY2xhc3NOYW1lLCBkdW1wLCBpc0NvbXBvbmVudCk7XG4gICAgcmV0dXJuIGN0eC5kZWZpbml0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGxhaW5Kc29uQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIG9iajogUmVjb3JkPHN0cmluZywgYW55Pik6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2BjbGFzcyAke3Nhbml0aXplVHNOYW1lKGNsYXNzTmFtZSl9IHtgXTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopLnNvcnQoKSkge1xuICAgICAgICBjb25zdCBwcm9wTmFtZSA9IGlzU2FmZVRzSWRlbnRpZmllcihrZXkpID8ga2V5IDogSlNPTi5zdHJpbmdpZnkoa2V5KTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICR7cHJvcE5hbWV9OiAke3BsYWluSnNvblRvVHNUeXBlKG9ialtrZXldKX07YCk7XG4gICAgfVxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHBsYWluSnNvblRvVHNUeXBlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkgcmV0dXJuICdudWxsJztcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gJ251bWJlcic7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gYEFycmF5PCR7dmFsdWUubGVuZ3RoID4gMCA/IHBsYWluSnNvblRvVHNUeXBlKHZhbHVlWzBdKSA6ICd1bmtub3duJ30+YDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHJldHVybiAnUmVjb3JkPHN0cmluZywgdW5rbm93bj4nO1xuICAgIHJldHVybiAndW5rbm93bic7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckFzc2V0SW1wb3J0ZXJDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgYW55PiwgYXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtgY2xhc3MgJHtzYW5pdGl6ZVRzTmFtZShjbGFzc05hbWUpfSB7YF07XG4gICAgY29uc3QgcGF0aHMgPSBuZXcgU2V0KFsuLi5PYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSwgLi4uT2JqZWN0LmtleXMoYXJyYXlzID8/IHt9KV0pO1xuICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4ucGF0aHNdLnNvcnQoKSkge1xuICAgICAgICBjb25zdCBlbnRyeSA9IHByb3BlcnRpZXNbcGF0aF07XG4gICAgICAgIGNvbnN0IHRvb2x0aXAgPSByZXNvbHZlSTE4blRleHQoZW50cnk/LnRvb2x0aXApO1xuICAgICAgICBpZiAodG9vbHRpcCAmJiB0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtzYW5pdGl6ZUZvckNvbW1lbnQodG9vbHRpcCl9ICovYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZW51bUxpc3QgPSBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeSk7XG4gICAgICAgIGxldCB0c1R5cGU6IHN0cmluZztcbiAgICAgICAgbGV0IGRlY29yYXRvclR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKGVudW1MaXN0KSB7XG4gICAgICAgICAgICBjb25zdCBlbnVtTmFtZSA9IHBhc2NhbENhc2VOYW1lKHBhdGgpO1xuICAgICAgICAgICAgZ2VuZXJhdGVDb25zdEVudW1EZWZpbml0aW9uKGN0eCwgZW51bU5hbWUsIGVudW1MaXN0KTtcbiAgICAgICAgICAgIHRzVHlwZSA9IGVudW1OYW1lO1xuICAgICAgICAgICAgZGVjb3JhdG9yVHlwZSA9IGVudW1OYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHNUeXBlID0gcmVzb2x2ZVRzVHlwZShlbnRyeSA/PyBhcnJheXNbcGF0aF0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcnJheXMgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5cywgcGF0aCkpIHtcbiAgICAgICAgICAgIHRzVHlwZSA9IGBBcnJheTwke3RzVHlwZX0+YDtcbiAgICAgICAgICAgIGlmIChkZWNvcmF0b3JUeXBlKSBkZWNvcmF0b3JUeXBlID0gYFske2RlY29yYXRvclR5cGV9XWA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVjb3JhdG9yID0gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IoZW50cnksIGRlY29yYXRvclR5cGUpO1xuICAgICAgICBpZiAoZGVjb3JhdG9yKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtkZWNvcmF0b3J9YCk7XG4gICAgICAgIH1cbiAgICAgICAgbGluZXMucHVzaChgICAgICR7cmVuZGVyUGF0aEFzUHJvcGVydHkocGF0aCl9OiAke3RzVHlwZX07YCk7XG4gICAgfVxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gWy4uLmN0eC5kZWZpbml0aW9ucywgbGluZXMuam9pbignXFxuJyldLmpvaW4oJ1xcblxcbicpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQYXRoQXNQcm9wZXJ0eShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBpc1NhZmVUc0lkZW50aWZpZXIocGF0aCkgPyBwYXRoIDogSlNPTi5zdHJpbmdpZnkocGF0aCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5QXNzZXRJbmZvKGlkOiBzdHJpbmcpOiBQcm9taXNlPHsgYXNzZXRJbmZvPzogYW55OyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGlkKTtcbiAgICAgICAgcmV0dXJuIGFzc2V0SW5mbyA/IHsgYXNzZXRJbmZvIH0gOiB7fTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYHF1ZXJ5LWFzc2V0LWluZm8gZmFpbGVkIGZvciAke2lkfTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlb2YgcmVmZXJlbmNlLnR5cGUgPT09ICdzdHJpbmcnICYmIHJlZmVyZW5jZS50eXBlLnN0YXJ0c1dpdGgoJ2Fzc2V0OicpO1xufVxuXG5mdW5jdGlvbiBpc05vZGVSZWZlcmVuY2UocmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHQgPSByZWZlcmVuY2UudHlwZTtcbiAgICByZXR1cm4gIXQgfHwgdCA9PT0gJ25vZGUnIHx8IHQgPT09ICdOb2RlJyB8fCB0ID09PSAnY2MuTm9kZSc7XG59XG5cbmZ1bmN0aW9uIGFzc2V0Q2xhc3NOYW1lKGFzc2V0SW5mbzogYW55LCByZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogc3RyaW5nIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcocmVmZXJlbmNlLnR5cGU/LnJlcGxhY2UoL15hc3NldDovLCAnJykgfHwgYXNzZXRJbmZvLnR5cGUgfHwgYXNzZXRJbmZvLmltcG9ydGVyIHx8ICdBc3NldCcpO1xuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShyYXcucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudFRhcmdldChyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogUHJvbWlzZTx7IG5vZGVVdWlkOiBzdHJpbmc7IGNvbXBvbmVudFR5cGU6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0+IHtcbiAgICBjb25zdCBmb3VuZCA9IGF3YWl0IGZpbmRDb21wb25lbnRJblNjZW5lKHJlZmVyZW5jZS5pZCk7XG4gICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgaWYgKHJlZmVyZW5jZS50eXBlICYmICFpc05vZGVSZWZlcmVuY2UocmVmZXJlbmNlKSAmJiAhaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZHVtcDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHJlZmVyZW5jZS5pZCk7XG4gICAgICAgICAgICBpZiAoZHVtcCAmJiBBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG5vZGVVdWlkOiByZWZlcmVuY2UuaWQsIGNvbXBvbmVudFR5cGU6IHJlZmVyZW5jZS50eXBlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gUmV0dXJuIHRoZSBjb21wb25lbnQgbG9va3VwIGZhaWx1cmUgYmVsb3cuXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgZXJyb3I6IGBpbnNwZWN0b3Jfc2V0X2luc3RhbmNlX3Byb3BlcnRpZXM6IGNvdWxkIG5vdCByZXNvbHZlIGNvbXBvbmVudCByZWZlcmVuY2UgJHtyZWZlcmVuY2UuaWR9LiBQYXNzIHJlZmVyZW5jZS5pZCBhcyBhIGNvbXBvbmVudCBVVUlEIHdpdGggcmVmZXJlbmNlLnR5cGUgYXMgdGhlIGNvbXBvbmVudCBjaWQvdHlwZSwgb3IgdXNlIGNjLk5vZGUgZm9yIG5vZGUgcHJvcGVydGllcy5gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmRDb21wb25lbnRJblNjZW5lKGNvbXBvbmVudFV1aWQ6IHN0cmluZyk6IFByb21pc2U8eyBub2RlVXVpZDogc3RyaW5nOyBjb21wb25lbnRUeXBlOiBzdHJpbmcgfSB8IG51bGw+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgIGNvbnN0IHF1ZXVlOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkodHJlZSkgPyBbLi4udHJlZV0gOiBbdHJlZV07XG4gICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVVdWlkID0gZHVtcFVud3JhcChpdGVtPy51dWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZVV1aWQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkoZHVtcD8uX19jb21wc19fKSA/IGR1bXAuX19jb21wc19fIDogW107XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBkdW1wVW53cmFwKGNvbXA/LnZhbHVlPy51dWlkID8/IGNvbXA/LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodXVpZCA9PT0gY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBTdHJpbmcoY29tcD8uX190eXBlX18gPz8gY29tcD8uY2lkID8/IGNvbXA/LnR5cGUgPz8gJ2NjLkNvbXBvbmVudCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIEtlZXAgc2Nhbm5pbmcgb3RoZXIgbm9kZXMuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtPy5jaGlsZHJlbikpIHF1ZXVlLnB1c2goLi4uaXRlbS5jaGlsZHJlbik7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKFxuICAgIHJlc3A6IFRvb2xSZXNwb25zZSxcbiAgICBraW5kOiAnbm9kZScgfCAnY29tcG9uZW50JyB8ICdhc3NldCcsXG4gICAgcmVxdWVzdGVkOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgdHlwZTogc3RyaW5nOyB2YWx1ZTogYW55IH0+LFxuKTogVG9vbFJlc3BvbnNlIHtcbiAgICBjb25zdCByYXdSZXN1bHRzID0gQXJyYXkuaXNBcnJheShyZXNwLmRhdGE/LnJlc3VsdHMpID8gcmVzcC5kYXRhLnJlc3VsdHMgOiBudWxsO1xuICAgIGNvbnN0IHJlc3VsdHMgPSByYXdSZXN1bHRzXG4gICAgICAgID8gcmF3UmVzdWx0cy5tYXAoKHI6IGFueSwgaTogbnVtYmVyKSA9PiAoe1xuICAgICAgICAgICAgcGF0aDogci5wYXRoID8/IHIucHJvcGVydHkgPz8gci5wcm9wZXJ0eVBhdGggPz8gcmVxdWVzdGVkW2ldPy5wYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogISFyLnN1Y2Nlc3MsXG4gICAgICAgICAgICBlcnJvcjogci5zdWNjZXNzID8gdW5kZWZpbmVkIDogKHIuZXJyb3IgPz8gJ3Vua25vd24nKSxcbiAgICAgICAgICAgIHdhcm5pbmc6IHIud2FybmluZyxcbiAgICAgICAgfSkpXG4gICAgICAgIDogcmVxdWVzdGVkLm1hcChwID0+ICh7XG4gICAgICAgICAgICBwYXRoOiBwLnBhdGgsXG4gICAgICAgICAgICBzdWNjZXNzOiAhIXJlc3Auc3VjY2VzcyxcbiAgICAgICAgICAgIGVycm9yOiByZXNwLnN1Y2Nlc3MgPyB1bmRlZmluZWQgOiAocmVzcC5lcnJvciA/PyByZXNwLm1lc3NhZ2UgPz8gJ3Vua25vd24nKSxcbiAgICAgICAgfSkpO1xuICAgIGNvbnN0IGZhaWxlZENvdW50ID0gcmVzdWx0cy5maWx0ZXIoKHI6IGFueSkgPT4gIXIuc3VjY2VzcykubGVuZ3RoO1xuICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgIHN1Y2Nlc3M6IHJlc3VsdHMuc29tZSgocjogYW55KSA9PiByLnN1Y2Nlc3MpLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBraW5kLFxuICAgICAgICAgICAgdG90YWw6IHJlc3VsdHMubGVuZ3RoLFxuICAgICAgICAgICAgZmFpbGVkQ291bnQsXG4gICAgICAgICAgICByZXN1bHRzLFxuICAgICAgICAgICAgZGVsZWdhdGVkOiByZXNwLmRhdGEsXG4gICAgICAgIH0sXG4gICAgICAgIG1lc3NhZ2U6IGZhaWxlZENvdW50ID09PSAwXG4gICAgICAgICAgICA/IGBXcm90ZSAke3Jlc3VsdHMubGVuZ3RofSAke2tpbmR9IHByb3BlcnRpZXNgXG4gICAgICAgICAgICA6IGAke2ZhaWxlZENvdW50fS8ke3Jlc3VsdHMubGVuZ3RofSAke2tpbmR9IHByb3BlcnR5IHdyaXRlcyBmYWlsZWRgLFxuICAgIH07XG4gICAgaWYgKHJlc3Aud2FybmluZykgcmVzcG9uc2Uud2FybmluZyA9IHJlc3Aud2FybmluZztcbiAgICBpZiAoIXJlc3BvbnNlLnN1Y2Nlc3MpIHJlc3BvbnNlLmVycm9yID0gcmVzcC5lcnJvciA/PyByZXNwLm1lc3NhZ2UgPz8gcmVzcG9uc2UubWVzc2FnZTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmludGVyZmFjZSBSZW5kZXJDb250ZXh0IHtcbiAgICBkZWZpbml0aW9uczogc3RyaW5nW107XG4gICAgZGVmaW5lZE5hbWVzOiBTZXQ8c3RyaW5nPjtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkUHJvcGVydHlUeXBlIHtcbiAgICB0c1R5cGU6IHN0cmluZztcbiAgICBkZWNvcmF0b3JUeXBlPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzVHNDbGFzcyhjdHg6IFJlbmRlckNvbnRleHQsIGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3Qgc2FmZUNsYXNzTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyhjbGFzc05hbWUgPz8gJycpLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgaWYgKGN0eC5kZWZpbmVkTmFtZXMuaGFzKHNhZmVDbGFzc05hbWUpKSByZXR1cm47XG4gICAgY3R4LmRlZmluZWROYW1lcy5hZGQoc2FmZUNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBjbGFzcyAke3NhZmVDbGFzc05hbWV9JHtpc0NvbXBvbmVudCA/ICcgZXh0ZW5kcyBDb21wb25lbnQnIDogJyd9IHtgKTtcblxuICAgIGlmIChkdW1wICYmIHR5cGVvZiBkdW1wID09PSAnb2JqZWN0Jykge1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BOYW1lIG9mIE9iamVjdC5rZXlzKGR1bXApKSB7XG4gICAgICAgICAgICBpZiAoTk9ERV9EVU1QX0lOVEVSTkFMX0tFWVMuaGFzKHByb3BOYW1lKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBwcm9wRW50cnkgPSBkdW1wW3Byb3BOYW1lXTtcbiAgICAgICAgICAgIGlmIChwcm9wRW50cnkgPT09IHVuZGVmaW5lZCB8fCBwcm9wRW50cnkgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgLy8gQ29jb3MgZHVtcCBlbnRyaWVzIGFyZSB0eXBpY2FsbHkgYHt0eXBlLCB2YWx1ZSwgdmlzaWJsZT8sIHJlYWRvbmx5PywgLi4ufWAuXG4gICAgICAgICAgICAvLyBTa2lwIGV4cGxpY2l0bHktaGlkZGVuIGluc3BlY3RvciBmaWVsZHM7IHRoZXkncmUgbm90IHVzZXItZmFjaW5nLlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wRW50cnkgPT09ICdvYmplY3QnICYmIHByb3BFbnRyeS52aXNpYmxlID09PSBmYWxzZSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRzUHJvcGVydHlUeXBlKGN0eCwgc2FmZUNsYXNzTmFtZSwgcHJvcE5hbWUsIHByb3BFbnRyeSk7XG4gICAgICAgICAgICBjb25zdCByZWFkb25seSA9IHByb3BFbnRyeT8ucmVhZG9ubHkgPyAncmVhZG9ubHkgJyA6ICcnO1xuICAgICAgICAgICAgY29uc3QgdG9vbHRpcFNyYzogc3RyaW5nIHwgdW5kZWZpbmVkID0gcHJvcEVudHJ5Py50b29sdGlwO1xuICAgICAgICAgICAgY29uc3QgdG9vbHRpcCA9IHJlc29sdmVJMThuVGV4dCh0b29sdGlwU3JjKTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwICYmIHR5cGVvZiB0b29sdGlwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtzYW5pdGl6ZUZvckNvbW1lbnQodG9vbHRpcCl9ICovYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkZWNvcmF0b3IgPSByZW5kZXJQcm9wZXJ0eURlY29yYXRvcihwcm9wRW50cnksIHJlc29sdmVkLmRlY29yYXRvclR5cGUpO1xuICAgICAgICAgICAgaWYgKGRlY29yYXRvcikge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAke2RlY29yYXRvcn1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHNhZmVQcm9wTmFtZSA9IGlzU2FmZVRzSWRlbnRpZmllcihwcm9wTmFtZSkgPyBwcm9wTmFtZSA6IEpTT04uc3RyaW5naWZ5KHByb3BOYW1lKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAke3JlYWRvbmx5fSR7c2FmZVByb3BOYW1lfTogJHtyZXNvbHZlZC50c1R5cGV9O2ApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFpc0NvbXBvbmVudCAmJiBBcnJheS5pc0FycmF5KGR1bXA/Ll9fY29tcHNfXykgJiYgZHVtcC5fX2NvbXBzX18ubGVuZ3RoID4gMCkge1xuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnICAgIC8vIENvbXBvbmVudHMgb24gdGhpcyBub2RlIChpbnNwZWN0IGVhY2ggc2VwYXJhdGVseSB2aWEgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gd2l0aCB0aGUgaG9zdCBub2RlIFVVSUQgZmlyc3QpOicpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZHVtcC5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIGNvbnN0IGNUeXBlID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy5fX3R5cGVfXyA/PyBjb21wPy50eXBlID8/ICd1bmtub3duJykpO1xuICAgICAgICAgICAgY29uc3QgY1V1aWQgPSBzYW5pdGl6ZUZvckNvbW1lbnQoU3RyaW5nKGR1bXBVbndyYXAoY29tcD8udmFsdWU/LnV1aWQgPz8gY29tcD8udXVpZCwgJz8nKSkpO1xuICAgICAgICAgICAgbGluZXMucHVzaChgICAgIC8vIC0gJHtjVHlwZX0gIHV1aWQ9JHtjVXVpZH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBjdHguZGVmaW5pdGlvbnMucHVzaChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB0b29sdGlwcyBhbmQgY29tcG9uZW50IG1ldGFkYXRhIGNhblxuLy8gY29udGFpbiBgKi9gIChjbG9zZXMgdGhlIGRvYyBjb21tZW50KSwgYFxcbmAgKGJyZWFrcyBhIGAvL2AgY29tbWVudFxuLy8gaW50byBzdHJheSBjb2RlKSwgb3IgYFxccmAuIFNpbmdsZS1saW5lLWNvbW1lbnQgY29udGV4dCBpcyB0aGVcbi8vIGRhbmdlcm91cyBvbmUuIFN0cmlwIGJvdGguXG5mdW5jdGlvbiBzYW5pdGl6ZUZvckNvbW1lbnQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvXFwqXFwvL2csICcqXFxcXC8nKVxuICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJyAnKTtcbn1cblxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNsYXVkZSk6IHVuc2FuaXRpemVkIGN1c3RvbS1zY3JpcHQgY2xhc3MgbmFtZXNcbi8vIChlLmcuIGBNeS5Gb29gLCBgTXktRm9vYCkgZW1pdHRlZCBkaXJlY3RseSBpbnRvIHRoZSBUUyBvdXRwdXQgcHJvZHVjZVxuLy8gaW52YWxpZCBUUy4gSlNPTi1zdHJpbmdpZnkgYW55IHByb3BlcnR5IG5hbWUgdGhhdCBpc24ndCBhIHBsYWluIGlkZW50LlxuZnVuY3Rpb24gaXNTYWZlVHNJZGVudGlmaWVyKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAvXltBLVphLXpfJF1bQS1aYS16MC05XyRdKiQvLnRlc3QobmFtZSk7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUc1Byb3BlcnR5VHlwZShjdHg6IFJlbmRlckNvbnRleHQsIG93bmVyQ2xhc3NOYW1lOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIGVudHJ5OiBhbnkpOiBSZXNvbHZlZFByb3BlcnR5VHlwZSB7XG4gICAgY29uc3QgaXNBcnJheSA9ICEhZW50cnk/LmlzQXJyYXk7XG4gICAgY29uc3QgaXRlbUVudHJ5ID0gaXNBcnJheSA/IGFycmF5SXRlbUVudHJ5KGVudHJ5KSA6IGVudHJ5O1xuICAgIGNvbnN0IGVudW1MaXN0ID0gZW51bU9yQml0bWFza0xpc3QoaXRlbUVudHJ5KSA/PyBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeSk7XG4gICAgaWYgKGVudW1MaXN0KSB7XG4gICAgICAgIGNvbnN0IGVudW1OYW1lID0gcGFzY2FsQ2FzZU5hbWUocHJvcE5hbWUpO1xuICAgICAgICBnZW5lcmF0ZUNvbnN0RW51bURlZmluaXRpb24oY3R4LCBlbnVtTmFtZSwgZW51bUxpc3QpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7ZW51bU5hbWV9PmAgOiBlbnVtTmFtZSxcbiAgICAgICAgICAgIGRlY29yYXRvclR5cGU6IGlzQXJyYXkgPyBgWyR7ZW51bU5hbWV9XWAgOiBlbnVtTmFtZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBzdHJ1Y3RWYWx1ZSA9IG5lc3RlZFN0cnVjdFZhbHVlKGl0ZW1FbnRyeSk7XG4gICAgaWYgKHN0cnVjdFZhbHVlICYmICFpc0NvbW1vblZhbHVlVHlwZShpdGVtRW50cnk/LnR5cGUpICYmICFpc1JlZmVyZW5jZUVudHJ5KGl0ZW1FbnRyeSkpIHtcbiAgICAgICAgY29uc3Qgc3RydWN0TmFtZSA9IG5lc3RlZFN0cnVjdENsYXNzTmFtZShvd25lckNsYXNzTmFtZSwgcHJvcE5hbWUsIHN0cnVjdFZhbHVlLCBpc0FycmF5KTtcbiAgICAgICAgcHJvY2Vzc1RzQ2xhc3MoY3R4LCBzdHJ1Y3ROYW1lLCBzdHJ1Y3RWYWx1ZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7c3RydWN0TmFtZX0+YCA6IHN0cnVjdE5hbWUsXG4gICAgICAgICAgICBkZWNvcmF0b3JUeXBlOiBpc0FycmF5ID8gYFske3N0cnVjdE5hbWV9XWAgOiBzdHJ1Y3ROYW1lLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHRzVHlwZSA9IHJlc29sdmVUc1R5cGUoaXRlbUVudHJ5KTtcbiAgICByZXR1cm4geyB0c1R5cGU6IGlzQXJyYXkgPyBgQXJyYXk8JHt0c1R5cGV9PmAgOiB0c1R5cGUgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVRzVHlwZShlbnRyeTogYW55KTogc3RyaW5nIHtcbiAgICBpZiAoZW50cnkgPT09IHVuZGVmaW5lZCB8fCBlbnRyeSA9PT0gbnVsbCkgcmV0dXJuICd1bmtub3duJztcbiAgICAvLyBQbGFpbiBwcmltaXRpdmVzIHBhc3NlZCB0aHJvdWdoIGRpcmVjdGx5IChyYXJlIGluIGR1bXAgc2hhcGUpLlxuICAgIGNvbnN0IHR0ID0gdHlwZW9mIGVudHJ5O1xuICAgIGlmICh0dCA9PT0gJ3N0cmluZycpIHJldHVybiAnc3RyaW5nJztcbiAgICBpZiAodHQgPT09ICdudW1iZXInKSByZXR1cm4gJ251bWJlcic7XG4gICAgaWYgKHR0ID09PSAnYm9vbGVhbicpIHJldHVybiAnYm9vbGVhbic7XG5cbiAgICBjb25zdCByYXdUeXBlOiBzdHJpbmcgPSBlbnRyeS50eXBlID8/IGVudHJ5Ll9fdHlwZV9fID8/ICcnO1xuXG4gICAgbGV0IHRzOiBzdHJpbmc7XG4gICAgc3dpdGNoIChyYXdUeXBlKSB7XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6IHRzID0gJ3N0cmluZyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdCb29sZWFuJzogdHMgPSAnYm9vbGVhbic7IGJyZWFrO1xuICAgICAgICBjYXNlICdJbnRlZ2VyJzpcbiAgICAgICAgY2FzZSAnRmxvYXQnOlxuICAgICAgICBjYXNlICdOdW1iZXInOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgIGNhc2UgJ0JpdE1hc2snOiB0cyA9ICdudW1iZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMic6IHRzID0gJ1ZlYzInOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjMyc6IHRzID0gJ1ZlYzMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuVmVjNCc6IHRzID0gJ1ZlYzQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuQ29sb3InOiB0cyA9ICdDb2xvcic7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5SZWN0JzogdHMgPSAnUmVjdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5TaXplJzogdHMgPSAnU2l6ZSc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5RdWF0JzogdHMgPSAnUXVhdCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQzJzogdHMgPSAnTWF0Myc7IGJyZWFrO1xuICAgICAgICBjYXNlICdjYy5NYXQ0JzogdHMgPSAnTWF0NCc7IGJyZWFrO1xuICAgICAgICBjYXNlICcnOiB0cyA9ICd1bmtub3duJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIC8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiBzYW5pdGl6ZSBjdXN0b20gY2xhc3MgbmFtZXNcbiAgICAgICAgICAgIC8vIGJlZm9yZSBwYXN0aW5nIHRoZW0gaW50byB0aGUgVFMgb3V0cHV0LiBgTXkuRm9vYCBldGMuXG4gICAgICAgICAgICAvLyB3b3VsZCBiZSBpbnZhbGlkIFRTIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGNvbnN0IHN0cmlwcGVkVHlwZSA9IHNhbml0aXplVHNOYW1lKHJhd1R5cGUucmVwbGFjZSgvXmNjXFwuLywgJycpKSB8fCAndW5rbm93bic7XG4gICAgICAgICAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgaXNSZWZlcmVuY2UgPSBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Db21wb25lbnQnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcbiAgICAgICAgICAgIHRzID0gaXNSZWZlcmVuY2UgPyBgSW5zdGFuY2VSZWZlcmVuY2U8JHtzdHJpcHBlZFR5cGV9PmAgOiBzdHJpcHBlZFR5cGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRzO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQcm9wZXJ0eURlY29yYXRvcihlbnRyeTogYW55LCByZXNvbHZlZFR5cGU/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgdHlwZUV4cHIgPSByZXNvbHZlZFR5cGUgPz8gZGVjb3JhdG9yVHlwZUV4cHJlc3Npb24oZW50cnkpO1xuICAgIGNvbnN0IGhhc0VudW1PckJpdG1hc2tMaXN0ID0gZW51bU9yQml0bWFza0xpc3QoZW50cnkpICE9PSBudWxsXG4gICAgICAgIHx8IGVudW1PckJpdG1hc2tMaXN0KGFycmF5SXRlbUVudHJ5KGVudHJ5KSkgIT09IG51bGw7XG4gICAgaWYgKChlbnRyeS50eXBlICE9PSB1bmRlZmluZWQgfHwgaGFzRW51bU9yQml0bWFza0xpc3QpICYmIHR5cGVFeHByKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYHR5cGU6ICR7dHlwZUV4cHJ9YCk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBhdHRyIG9mIFsnbWluJywgJ21heCcsICdzdGVwJywgJ3VuaXQnLCAncmFkaWFuJywgJ211bHRpbGluZScsICd0b29sdGlwJ10pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBlbnRyeVthdHRyXTtcbiAgICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHBhcnRzLnB1c2goYCR7YXR0cn06ICR7ZGVjb3JhdG9yVmFsdWUoYXR0ciA9PT0gJ3Rvb2x0aXAnIHx8IGF0dHIgPT09ICdkaXNwbGF5TmFtZScgPyByZXNvbHZlSTE4blRleHQodmFsdWUpIDogdmFsdWUpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGBAcHJvcGVydHkoeyAke3BhcnRzLmpvaW4oJywgJyl9IH0pYDtcbn1cblxuZnVuY3Rpb24gZGVjb3JhdG9yVHlwZUV4cHJlc3Npb24oZW50cnk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGlzQXJyYXkgPSAhIWVudHJ5Py5pc0FycmF5O1xuICAgIGNvbnN0IGl0ZW1FbnRyeSA9IGlzQXJyYXkgPyBhcnJheUl0ZW1FbnRyeShlbnRyeSkgOiBlbnRyeTtcbiAgICBjb25zdCByYXdUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBpdGVtRW50cnk/LnR5cGU7XG4gICAgaWYgKCFyYXdUeXBlKSByZXR1cm4gbnVsbDtcblxuICAgIGxldCBleHByOiBzdHJpbmcgfCBudWxsO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdJbnRlZ2VyJzogZXhwciA9ICdDQ0ludGVnZXInOyBicmVhaztcbiAgICAgICAgY2FzZSAnRmxvYXQnOlxuICAgICAgICBjYXNlICdOdW1iZXInOiBleHByID0gJ0NDRmxvYXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnU3RyaW5nJzogZXhwciA9ICdTdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IGV4cHIgPSAnQm9vbGVhbic7IGJyZWFrO1xuICAgICAgICBjYXNlICdFbnVtJzpcbiAgICAgICAgY2FzZSAnQml0TWFzayc6IGV4cHIgPSAnTnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGV4cHIgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgfVxuICAgIGlmICghZXhwcikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGlzQXJyYXkgPyBgWyR7ZXhwcn1dYCA6IGV4cHI7XG59XG5cbmZ1bmN0aW9uIGRlY29yYXRvclZhbHVlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSTE4blRleHQodmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ2kxOG46JykpIHJldHVybiB2YWx1ZTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0cmFuc2xhdGVkID0gRWRpdG9yLkkxOG4udCh2YWx1ZS5zbGljZSg1KSk7XG4gICAgICAgIGlmICh0eXBlb2YgdHJhbnNsYXRlZCA9PT0gJ3N0cmluZycgJiYgdHJhbnNsYXRlZC50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zbGF0ZWQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gS2VlcCBvcmlnaW5hbCBpMThuIGtleSB3aGVuIGVkaXRvciBsb2NhbGl6YXRpb24gaXMgdW5hdmFpbGFibGUuXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gYXJyYXlJdGVtRW50cnkoZW50cnk6IGFueSk6IGFueSB7XG4gICAgaWYgKGVudHJ5Py5lbGVtZW50VHlwZURhdGEpIHJldHVybiBlbnRyeS5lbGVtZW50VHlwZURhdGE7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50cnk/LnZhbHVlKSAmJiBlbnRyeS52YWx1ZS5sZW5ndGggPiAwKSByZXR1cm4gZW50cnkudmFsdWVbMF07XG4gICAgcmV0dXJuIGVudHJ5O1xufVxuXG5mdW5jdGlvbiBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeTogYW55KTogYW55W10gfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGVudHJ5LmVudW1MaXN0KSA/IGVudHJ5LmVudW1MaXN0XG4gICAgICAgIDogQXJyYXkuaXNBcnJheShlbnRyeS5iaXRtYXNrTGlzdCkgPyBlbnRyeS5iaXRtYXNrTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5lbnVtTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnk/LnVzZXJEYXRhPy5iaXRtYXNrTGlzdCkgPyBlbnRyeS51c2VyRGF0YS5iaXRtYXNrTGlzdFxuICAgICAgICA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlQ29uc3RFbnVtRGVmaW5pdGlvbihjdHg6IFJlbmRlckNvbnRleHQsIGVudW1OYW1lOiBzdHJpbmcsIGl0ZW1zOiBhbnlbXSk6IHZvaWQge1xuICAgIGNvbnN0IHNhZmVFbnVtTmFtZSA9IHNhbml0aXplVHNOYW1lKGVudW1OYW1lKTtcbiAgICBpZiAoY3R4LmRlZmluZWROYW1lcy5oYXMoc2FmZUVudW1OYW1lKSkgcmV0dXJuO1xuICAgIGN0eC5kZWZpbmVkTmFtZXMuYWRkKHNhZmVFbnVtTmFtZSk7XG5cbiAgICBjb25zdCB1c2VkTWVtYmVyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbYGNvbnN0IGVudW0gJHtzYWZlRW51bU5hbWV9IHtgXTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCByYXdOYW1lID0gaXRlbT8ubmFtZSA/PyBpdGVtPy5kaXNwbGF5TmFtZSA/PyBpdGVtPy52YWx1ZSA/PyBgVmFsdWUke2luZGV4fWA7XG4gICAgICAgIGxldCBtZW1iZXJOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHJhd05hbWUpKTtcbiAgICAgICAgaWYgKHVzZWRNZW1iZXJOYW1lcy5oYXMobWVtYmVyTmFtZSkpIHtcbiAgICAgICAgICAgIG1lbWJlck5hbWUgPSBgJHttZW1iZXJOYW1lfV8ke2luZGV4fWA7XG4gICAgICAgIH1cbiAgICAgICAgdXNlZE1lbWJlck5hbWVzLmFkZChtZW1iZXJOYW1lKTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBpdGVtPy52YWx1ZTtcbiAgICAgICAgY29uc3QgaW5pdGlhbGl6ZXIgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKVxuICAgICAgICAgICAgOiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyBTdHJpbmcodmFsdWUpXG4gICAgICAgICAgICAgICAgOiBTdHJpbmcoaW5kZXgpO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHttZW1iZXJOYW1lfSA9ICR7aW5pdGlhbGl6ZXJ9LGApO1xuICAgIH0pO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBjdHguZGVmaW5pdGlvbnMucHVzaChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbmZ1bmN0aW9uIG5lc3RlZFN0cnVjdFZhbHVlKGVudHJ5OiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHZhbHVlID0gZW50cnkudmFsdWU7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpICYmICdfX3R5cGVfXycgaW4gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAoJ19fdHlwZV9fJyBpbiBlbnRyeSAmJiAhKCd0eXBlJyBpbiBlbnRyeSkpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbmVzdGVkU3RydWN0Q2xhc3NOYW1lKG93bmVyQ2xhc3NOYW1lOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnksIGlzQXJyYXk6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgIGNvbnN0IHR5cGVOYW1lID0gc2FuaXRpemVUc05hbWUoU3RyaW5nKHZhbHVlPy5fX3R5cGVfXyA/PyAnJykucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbiAgICBpZiAodHlwZU5hbWUgJiYgdHlwZU5hbWUgIT09ICdfVW5rbm93bicgJiYgdHlwZU5hbWUgIT09ICdPYmplY3QnKSB7XG4gICAgICAgIHJldHVybiB0eXBlTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhbml0aXplVHNOYW1lKGAke293bmVyQ2xhc3NOYW1lfSR7cGFzY2FsQ2FzZU5hbWUocHJvcE5hbWUpfSR7aXNBcnJheSA/ICdJdGVtJyA6ICdUeXBlJ31gKTtcbn1cblxuZnVuY3Rpb24gaXNDb21tb25WYWx1ZVR5cGUodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdjYy5WZWMyJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuVmVjMydcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlZlYzQnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5Db2xvcidcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlJlY3QnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5TaXplJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuUXVhdCdcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLk1hdDMnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5NYXQ0Jztcbn1cblxuZnVuY3Rpb24gaXNSZWZlcmVuY2VFbnRyeShlbnRyeTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcbiAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGVudHJ5LmV4dGVuZHMpID8gZW50cnkuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuT2JqZWN0JylcbiAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdDb21wb25lbnQnXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJ1xuICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICB8fCAocmF3VHlwZS5zdGFydHNXaXRoKCdjYy4nKSAmJiAhaXNDb21tb25WYWx1ZVR5cGUocmF3VHlwZSkpO1xufVxuXG5mdW5jdGlvbiBwYXNjYWxDYXNlTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHdvcmRzID0gU3RyaW5nKG5hbWUgPz8gJycpXG4gICAgICAgIC5yZXBsYWNlKC8oW2EtejAtOV0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAuc3BsaXQoL1teQS1aYS16MC05XSsvKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgIGNvbnN0IHBhc2NhbCA9IHdvcmRzLm1hcCgod29yZCkgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkpLmpvaW4oJycpO1xuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShwYXNjYWwgfHwgbmFtZSB8fCAnVmFsdWUnKTtcbn1cblxuZnVuY3Rpb24gaXNDb21wb25lbnREdW1wKGR1bXA6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZHVtcCB8fCB0eXBlb2YgZHVtcCAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICcnKTtcbiAgICBpZiAocmF3VHlwZSA9PT0gJ05vZGUnIHx8IHJhd1R5cGUgPT09ICdjYy5Ob2RlJykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGV4dGVuZHNMaXN0OiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoZHVtcC5leHRlbmRzKSA/IGR1bXAuZXh0ZW5kcyA6IFtdO1xuICAgIHJldHVybiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuQ29tcG9uZW50JykgfHwgIUFycmF5LmlzQXJyYXkoZHVtcC5fX2NvbXBzX18pO1xufVxuXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgpOiB0aGUgdjIuNC4xIGltcGxlbWVudGF0aW9uIG9ubHkgc3RyaXBwZWRcbi8vIG5vbi1pZGVudGlmaWVyIGNoYXJhY3RlcnMgYnV0IGRpZG4ndCBndWFyZCBhZ2FpbnN0IGEgZGlnaXQtbGVhZGluZ1xuLy8gcmVzdWx0IChgY2xhc3MgMmRTcHJpdGVgKSBvciBhbiBlbXB0eSByZXN1bHQgKGFmdGVyIHN0cmlwcGluZyBhbGxcbi8vIGNoYXJzIGluIGEgVVVJRC1zaGFwZWQgX190eXBlX18pLiBCb3RoIHByb2R1Y2UgaW52YWxpZCBUUy4gUHJlZml4XG4vLyBkaWdpdC1sZWFkaW5nIGFuZCBlbXB0eSBjYXNlcyB3aXRoIGBfYCAvIGBfVW5rbm93bmAuXG5mdW5jdGlvbiBzYW5pdGl6ZVRzTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBTdHJpbmcobmFtZSA/PyAnJykucmVwbGFjZSgvW15hLXpBLVowLTlfXS9nLCAnXycpO1xuICAgIGlmIChjbGVhbmVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuICdfVW5rbm93bic7XG4gICAgaWYgKC9eWzAtOV0vLnRlc3QoY2xlYW5lZCkpIHJldHVybiBgXyR7Y2xlYW5lZH1gO1xuICAgIHJldHVybiBjbGVhbmVkO1xufVxuIl19