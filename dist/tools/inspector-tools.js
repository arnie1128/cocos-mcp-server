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
        var _a, _b, _c, _d, _e, _f;
        switch (args.settingsType) {
            case 'CommonTypes':
                return (0, response_1.ok)({ definition: COMMON_TYPES_DEFINITION });
            case 'CurrentSceneGlobals': {
                try {
                    const tree = await Editor.Message.request('scene', 'query-node-tree');
                    const item = tree === null || tree === void 0 ? void 0 : tree[0];
                    const rootUuid = (_b = (_a = item === null || item === void 0 ? void 0 : item.uuid) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : item === null || item === void 0 ? void 0 : item.uuid;
                    const dump = await Editor.Message.request('scene', 'query-node', rootUuid);
                    const globals = (_d = (_c = dump === null || dump === void 0 ? void 0 : dump._globals) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : dump === null || dump === void 0 ? void 0 : dump._globals;
                    if (!globals) {
                        return (0, response_1.fail)('CurrentSceneGlobals: no _globals found on scene root node');
                    }
                    const ts = renderTsClass('SceneGlobals', globals, false);
                    return (0, response_1.ok)({ definition: ts, settingsType: 'CurrentSceneGlobals' });
                }
                catch (err) {
                    return (0, response_1.fail)(`CurrentSceneGlobals: ${(_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err)}`);
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
                    return (0, response_1.fail)(`ProjectSettings: ${(_f = err === null || err === void 0 ? void 0 : err.message) !== null && _f !== void 0 ? _f : String(err)}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2luc3BlY3Rvci10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBQ3ZGLHlEQUFvRDtBQUNwRCx1REFBbUQ7QUFDbkQsNkNBQXlDO0FBRXpDLE1BQU0sdUJBQXVCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FnQi9CLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsK0RBQStEO0FBQy9ELHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsbUNBQW1DO0FBQ25DLEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsbUVBQW1FO0FBQ25FLHNFQUFzRTtBQUN0RSw4QkFBOEI7QUFDOUIsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUNwQyxVQUFVLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxrQkFBa0I7SUFDekQsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNO0lBQzFCLFVBQVUsRUFBRSxRQUFRO0lBQ3BCLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsaUJBQWlCO0lBQzlELG1CQUFtQixFQUFFLGFBQWE7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsTUFBYSxjQUFjO0lBTXZCO1FBSmlCLG1CQUFjLEdBQUcsSUFBSSxpQ0FBYyxFQUFFLENBQUM7UUFDdEMsbUJBQWMsR0FBRyxJQUFJLGdDQUFjLEVBQUUsQ0FBQztRQUN0QyxjQUFTLEdBQUcsSUFBSSxzQkFBUyxFQUFFLENBQUM7UUFHekMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0Qs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QUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRCxxRUFBcUU7QUFDckUscUVBQXFFO0FBQ3JFLG9FQUFvRTtBQUNwRSxvRUFBb0U7QUFDcEUsdURBQXVEO0FBQ3ZELFNBQVMsY0FBYyxDQUFDLElBQVk7SUFDaEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksYUFBSixJQUFJLGNBQUosSUFBSSxHQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNsRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sVUFBVSxDQUFDO0lBQzVDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7UUFBRSxPQUFPLElBQUksT0FBTyxFQUFFLENBQUM7SUFDakQsT0FBTyxPQUFPLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogaW5zcGVjdG9yLXRvb2xzIOKAlCBUeXBlU2NyaXB0IGNsYXNzLWRlZmluaXRpb24gZ2VuZXJhdG9yIGJhY2tlZCBieVxuICogY29jb3MgYHNjZW5lL3F1ZXJ5LW5vZGVgIGR1bXBzLlxuICpcbiAqIFR3byBNQ1AgdG9vbHM6XG4gKiAgIC0gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uICDigJQgZm9yIGEgKipub2RlKiogb3JcbiAqICAgICBjb21wb25lbnQgcmVmZXJlbmNlLCB3YWxrIHRoZSBjb2NvcyBkdW1wIGFuZCBlbWl0IGEgVHlwZVNjcmlwdFxuICogICAgIGNsYXNzIGRlY2xhcmF0aW9uIEFJIGNhbiByZWFkIGJlZm9yZSBjaGFuZ2luZyBwcm9wZXJ0aWVzLiBBdm9pZHNcbiAqICAgICB0aGUgXCJBSSBndWVzc2VzIHByb3BlcnR5IG5hbWVcIiBmYWlsdXJlIG1vZGUuXG4gKiAgIC0gaW5zcGVjdG9yX2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiDigJQgcmV0dXJuIGhhcmRjb2RlZFxuICogICAgIGRlZmluaXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBldGMuKVxuICogICAgIHRoYXQgdGhlIGluc3RhbmNlIGRlZmluaXRpb24gcmVmZXJlbmNlcyBidXQgZG9lc24ndCBpbmxpbmUuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdilcbiAqIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGUvc291cmNlL3V0Y3AvdG9vbHMvdHlwZXNjcmlwdC1kZWZlbml0aW9uLnRzYC5cbiAqIE91ciBpbXBsIHdhbGtzIHByb3BlcnR5IGR1bXBzLCBkZWNvcmF0b3JzLCBlbnVtL0JpdE1hc2sgbWV0YWRhdGEsXG4gKiBuZXN0ZWQgc3RydWN0cywgYXJyYXlzLCBhbmQgcmVmZXJlbmNlcy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIEBtY3BUb29sIGRlY29yYXRvciAodjIuNC4wIHN0ZXAgNSkuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuaW1wb3J0IHsgQXNzZXRNZXRhVG9vbHMgfSBmcm9tICcuL2Fzc2V0LW1ldGEtdG9vbHMnO1xuaW1wb3J0IHsgQ29tcG9uZW50VG9vbHMgfSBmcm9tICcuL2NvbXBvbmVudC10b29scyc7XG5pbXBvcnQgeyBOb2RlVG9vbHMgfSBmcm9tICcuL25vZGUtdG9vbHMnO1xuXG5jb25zdCBDT01NT05fVFlQRVNfREVGSU5JVElPTiA9IGAvLyBDb2NvcyBjb21tb24gdmFsdWUgdHlwZXMg4oCUIHJlZmVyZW5jZWQgYnkgaW5zdGFuY2UgZGVmaW5pdGlvbnMuXG50eXBlIEluc3RhbmNlUmVmZXJlbmNlPFQgPSB1bmtub3duPiA9IHsgaWQ6IHN0cmluZzsgdHlwZT86IHN0cmluZyB9O1xuY2xhc3MgVmVjMiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB9XG5jbGFzcyBWZWMzIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfVxuY2xhc3MgVmVjNCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgQ29sb3IgeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXI7IH1cbmNsYXNzIFJlY3QgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1cbmNsYXNzIFNpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVxuY2xhc3MgUXVhdCB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IHc6IG51bWJlcjsgfVxuY2xhc3MgTWF0MyB7IG0wMDogbnVtYmVyOyBtMDE6IG51bWJlcjsgbTAyOiBudW1iZXI7XG4gIG0wMzogbnVtYmVyOyBtMDQ6IG51bWJlcjsgbTA1OiBudW1iZXI7XG4gIG0wNjogbnVtYmVyOyBtMDc6IG51bWJlcjsgbTA4OiBudW1iZXI7IH1cbmNsYXNzIE1hdDQgeyBtMDA6IG51bWJlcjsgbTAxOiBudW1iZXI7IG0wMjogbnVtYmVyOyBtMDM6IG51bWJlcjtcbiAgbTA0OiBudW1iZXI7IG0wNTogbnVtYmVyOyBtMDY6IG51bWJlcjsgbTA3OiBudW1iZXI7XG4gIG0wODogbnVtYmVyOyBtMDk6IG51bWJlcjsgbTEwOiBudW1iZXI7IG0xMTogbnVtYmVyO1xuICBtMTI6IG51bWJlcjsgbTEzOiBudW1iZXI7IG0xNDogbnVtYmVyOyBtMTU6IG51bWJlcjsgfVxuYDtcblxuLy8gTmFtZXMgdGhhdCBzaG93IHVwIGF0IHRoZSB0b3Agb2YgZXZlcnkgbm9kZSBkdW1wIGJ1dCBhcmVuJ3Rcbi8vIHVzZXItZmFjaW5nIHByb3BlcnRpZXM7IHN1cHByZXNzIGZyb20gZ2VuZXJhdGVkIGRlZmluaXRpb25zLlxuLy8gdjIuNC4xIHJldmlldyBmaXggKGNvZGV4KTogZXhwYW5kZWQgZnJvbSB0aGUgdjIuNC4wIG1pbmltYWwgbGlzdCB0b1xuLy8gY292ZXIgcHJlZmFiLWluc3RhbmNlL3NlcmlhbGl6YXRpb24gbWV0YWRhdGEgYW5kIGVkaXRvci1vbmx5IGZpZWxkc1xuLy8gdGhhdCBBSSBzaG91bGRuJ3QgdHJ5IHRvIG11dGF0ZS5cbi8vXG4vLyB2Mi40LjIgcmV2aWV3IGZpeCAoY29kZXgrY2xhdWRlK2dlbWluaSk6IENPTVBPTkVOVF9JTlRFUk5BTF9LRVlTIHdhc1xuLy8gcmVtb3ZlZCBhZnRlciBkcmlmdGluZyBvdXQgb2Ygc3luYyB3aXRoIGNvY29zIGVkaXRvci4gVGhlIHNoYXJlZFxuLy8gcmVuZGVyZXIga2VlcHMgdGhpcyBjb25zZXJ2YXRpdmUgbm9kZSBtZXRhZGF0YSBmaWx0ZXIgZm9yIGJvdGggbm9kZVxuLy8gYW5kIGNvbXBvbmVudC1zaGFwZWQgZHVtcHMuXG5jb25zdCBOT0RFX0RVTVBfSU5URVJOQUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICdfX3R5cGVfXycsICdfX2NvbXBzX18nLCAnX19wcmVmYWJfXycsICdfX2VkaXRvckV4dHJhc19fJyxcbiAgICAnX29iakZsYWdzJywgJ19pZCcsICd1dWlkJyxcbiAgICAnY2hpbGRyZW4nLCAncGFyZW50JyxcbiAgICAnX3ByZWZhYkluc3RhbmNlJywgJ19wcmVmYWInLCAnbW91bnRlZFJvb3QnLCAnbW91bnRlZENoaWxkcmVuJyxcbiAgICAncmVtb3ZlZENvbXBvbmVudHMnLCAnX2NvbXBvbmVudHMnLFxuXSk7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBhc3NldE1ldGFUb29scyA9IG5ldyBBc3NldE1ldGFUb29scygpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5vZGVUb29scyA9IG5ldyBOb2RlVG9vbHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBjb2NvcyBjb21tb24gdHlwZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXR1cm4gaGFyZGNvZGVkIFR5cGVTY3JpcHQgZGVjbGFyYXRpb25zIGZvciBjb2NvcyB2YWx1ZSB0eXBlcyAoVmVjMi8zLzQsIENvbG9yLCBSZWN0LCBTaXplLCBRdWF0LCBNYXQzLzQpIGFuZCB0aGUgSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuIEFJIGNhbiBwcmVwZW5kIHRoaXMgdG8gaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uIG91dHB1dCBiZWZvcmUgZ2VuZXJhdGluZyB0eXBlLXNhZmUgY29kZS4gTm8gc2NlbmUgcXVlcnkuIFN1cHBvcnRzIGJvdGggbm9kZSBhbmQgY29tcG9uZW50IGluc3RhbmNlIGR1bXBzIGluY2x1ZGluZyBAcHJvcGVydHkgZGVjb3JhdG9ycyBhbmQgZW51bSB0eXBlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Q29tbW9uVHlwZXNEZWZpbml0aW9uKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBvayh7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9pbnN0YW5jZV9kZWZpbml0aW9uJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGluc3RhbmNlIFRTIGRlZmluaXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBHZW5lcmF0ZSBhIFR5cGVTY3JpcHQgY2xhc3MgZGVjbGFyYXRpb24gZm9yIGEgc2NlbmUgbm9kZSwgZGVyaXZlZCBmcm9tIHRoZSBsaXZlIGNvY29zIHNjZW5lL3F1ZXJ5LW5vZGUgZHVtcC4gVGhlIGdlbmVyYXRlZCBjbGFzcyBpbmNsdWRlcyBhIGNvbW1lbnQgbGlzdGluZyB0aGUgY29tcG9uZW50cyBhdHRhY2hlZCB0byB0aGUgbm9kZSAod2l0aCBVVUlEcykuIEFJIHNob3VsZCBjYWxsIHRoaXMgQkVGT1JFIHdyaXRpbmcgcHJvcGVydGllcyBzbyBpdCBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciB3aXRoIGdldF9jb21tb25fdHlwZXNfZGVmaW5pdGlvbiBmb3IgVmVjMi9Db2xvci9ldGMgcmVmZXJlbmNlcy4gU3VwcG9ydHMgYm90aCBub2RlIGFuZCBjb21wb25lbnQgaW5zdGFuY2UgZHVtcHMgaW5jbHVkaW5nIEBwcm9wZXJ0eSBkZWNvcmF0b3JzIGFuZCBlbnVtIHR5cGVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBvciBjb21wb25lbnQuIHtpZH0gPSBpbnN0YW5jZSBVVUlELCB7dHlwZX0gb3B0aW9uYWwgY2MgY2xhc3MgbGFiZWwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0SW5zdGFuY2VEZWZpbml0aW9uKGFyZ3M6IHsgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbjogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXNzZXRJbmZvUmVzdWx0ID0gYXdhaXQgcXVlcnlBc3NldEluZm8ocmVmZXJlbmNlLmlkKTtcbiAgICAgICAgaWYgKGFzc2V0SW5mb1Jlc3VsdC5hc3NldEluZm8gfHwgaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlKSkge1xuICAgICAgICAgICAgaWYgKCFhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYXNzZXRJbmZvUmVzdWx0LmVycm9yID8/IGBpbnNwZWN0b3I6IGFzc2V0IG5vdCBmb3VuZCBmb3IgJHtyZWZlcmVuY2UuaWR9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0QXNzZXRJbnN0YW5jZURlZmluaXRpb24ocmVmZXJlbmNlLCBhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZHVtcDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHJlZmVyZW5jZS5pZCk7XG4gICAgICAgICAgICBpZiAoIWR1bXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgaW5zcGVjdG9yOiBxdWVyeS1ub2RlIHJldHVybmVkIG5vIGR1bXAgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjQuMiByZXZpZXcgZml4IChjb2RleCk6IHRydXN0IHRoZSBkdW1wJ3MgX190eXBlX18sIG5vdFxuICAgICAgICAgICAgLy8gdGhlIGNhbGxlci1zdXBwbGllZCByZWZlcmVuY2UudHlwZS4gQSBjYWxsZXIgcGFzc2luZ1xuICAgICAgICAgICAgLy8ge2lkOiBub2RlVXVpZCwgdHlwZTogJ2NjLlNwcml0ZSd9IG90aGVyd2lzZSBnb3QgYSBub2RlXG4gICAgICAgICAgICAvLyBkdW1wIHJlbmRlcmVkIGFzIGBjbGFzcyBTcHJpdGVgLCBtaXNsYWJlbGxpbmcgdGhlXG4gICAgICAgICAgICAvLyBkZWNsYXJhdGlvbiBlbnRpcmVseS4gcmVmZXJlbmNlLnR5cGUgaXMgbm93IGRpYWdub3N0aWNcbiAgICAgICAgICAgIC8vIG9ubHkg4oCUIHN1cmZhY2VkIGluIHRoZSByZXNwb25zZSBkYXRhIHNvIGNhbGxlcnMgY2FuIHNlZVxuICAgICAgICAgICAgLy8gYSBtaXNtYXRjaCBidXQgbmV2ZXIgdXNlZCBhcyB0aGUgY2xhc3MgbmFtZS5cbiAgICAgICAgICAgIGNvbnN0IGR1bXBUeXBlID0gU3RyaW5nKGR1bXAuX190eXBlX18gPz8gZHVtcC50eXBlID8/ICdDb2Nvc0luc3RhbmNlJyk7XG4gICAgICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBkdW1wVHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJyk7XG4gICAgICAgICAgICBjb25zdCByZWZlcmVuY2VUeXBlTWlzbWF0Y2ggPSByZWZlcmVuY2UudHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlICE9PSBkdW1wVHlwZVxuICAgICAgICAgICAgICAgICYmIHJlZmVyZW5jZS50eXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSAhPT0gY2xhc3NOYW1lO1xuICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZSwgZHVtcCwgaXNDb21wb25lbnREdW1wKGR1bXApKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiBkdW1wLl9fdHlwZV9fID8/IHJlZmVyZW5jZS50eXBlIH0sXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IGlzQ29tcG9uZW50RHVtcChkdW1wKSA/ICdjb21wb25lbnQnIDogJ25vZGUnLFxuICAgICAgICAgICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChyZWZlcmVuY2VUeXBlTWlzbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5nID0gYGluc3BlY3RvcjogcmVmZXJlbmNlLnR5cGUgKCR7cmVmZXJlbmNlLnR5cGV9KSBkb2VzIG5vdCBtYXRjaCBkdW1wIF9fdHlwZV9fICgke2R1bXBUeXBlfSk7IGNsYXNzIGxhYmVsIHVzZXMgdGhlIGR1bXAgdmFsdWVgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGluc3BlY3RvcjogcXVlcnktbm9kZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBc3NldEluc3RhbmNlRGVmaW5pdGlvbihyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlLCBhc3NldEluZm86IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFzc2V0TWV0YVRvb2xzLmV4ZWN1dGUoJ2dldF9wcm9wZXJ0aWVzJywge1xuICAgICAgICAgICAgcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiB0cnVlLFxuICAgICAgICAgICAgdXNlQWR2YW5jZWRJbnNwZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghcmVzcC5zdWNjZXNzKSByZXR1cm4gcmVzcDtcbiAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gYCR7YXNzZXRDbGFzc05hbWUoYXNzZXRJbmZvLCByZWZlcmVuY2UpfUltcG9ydGVyYDtcbiAgICAgICAgY29uc3QgdHMgPSByZW5kZXJBc3NldEltcG9ydGVyQ2xhc3MoY2xhc3NOYW1lLCByZXNwLmRhdGE/LnByb3BlcnRpZXMgPz8ge30sIHJlc3AuZGF0YT8uYXJyYXlzID8/IHt9KTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogeyBpZDogcmVmZXJlbmNlLmlkLCB0eXBlOiByZWZlcmVuY2UudHlwZSA/PyBhc3NldEluZm8udHlwZSB9LFxuICAgICAgICAgICAga2luZDogJ2Fzc2V0JyxcbiAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICBkZWZpbml0aW9uOiB0cyxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3NldHRpbmdzX2RlZmluaXRpb24nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2V0dGluZ3MgVFMgZGVmaW5pdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEdlbmVyYXRlIGEgVHlwZVNjcmlwdCBjbGFzcyBkZWNsYXJhdGlvbiBmb3IgZWRpdG9yIHNldHRpbmdzIGR1bXBzLiBzZXR0aW5nc1R5cGUgc2VsZWN0cyB3aGljaCBkdW1wOiBDb21tb25UeXBlcyByZXR1cm5zIHRoZSBjb21tb24gY29jb3MgdmFsdWUgdHlwZXM7IEN1cnJlbnRTY2VuZUdsb2JhbHMgZHVtcHMgY3VycmVudCBzY2VuZSBnbG9iYWxzOyBQcm9qZWN0U2V0dGluZ3MgZHVtcHMgY29jb3MgcHJvamVjdCBzZXR0aW5ncyBjYXRlZ29yaWVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzZXR0aW5nc1R5cGU6IHouZW51bShbJ0NvbW1vblR5cGVzJywgJ0N1cnJlbnRTY2VuZUdsb2JhbHMnLCAnUHJvamVjdFNldHRpbmdzJ10pLmRlc2NyaWJlKCdXaGljaCBzZXR0aW5ncyBkdW1wIHRvIHJlbmRlci4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTZXR0aW5nc0RlZmluaXRpb24oYXJnczogeyBzZXR0aW5nc1R5cGU6ICdDb21tb25UeXBlcycgfCAnQ3VycmVudFNjZW5lR2xvYmFscycgfCAnUHJvamVjdFNldHRpbmdzJyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgc3dpdGNoIChhcmdzLnNldHRpbmdzVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnQ29tbW9uVHlwZXMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBvayh7IGRlZmluaXRpb246IENPTU1PTl9UWVBFU19ERUZJTklUSU9OIH0pO1xuICAgICAgICAgICAgY2FzZSAnQ3VycmVudFNjZW5lR2xvYmFscyc6IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gdHJlZT8uWzBdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290VXVpZCA9IGl0ZW0/LnV1aWQ/LnZhbHVlID8/IGl0ZW0/LnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCByb290VXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdsb2JhbHMgPSBkdW1wPy5fZ2xvYmFscz8udmFsdWUgPz8gZHVtcD8uX2dsb2JhbHM7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZ2xvYmFscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0N1cnJlbnRTY2VuZUdsb2JhbHM6IG5vIF9nbG9iYWxzIGZvdW5kIG9uIHNjZW5lIHJvb3Qgbm9kZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRzID0gcmVuZGVyVHNDbGFzcygnU2NlbmVHbG9iYWxzJywgZ2xvYmFscywgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBkZWZpbml0aW9uOiB0cywgc2V0dGluZ3NUeXBlOiAnQ3VycmVudFNjZW5lR2xvYmFscycgfSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEN1cnJlbnRTY2VuZUdsb2JhbHM6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ1Byb2plY3RTZXR0aW5ncyc6IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0U2V0dGluZ3M6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgJ3Byb2plY3QnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0U2V0dGluZ3MgfHwgdHlwZW9mIHByb2plY3RTZXR0aW5ncyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdQcm9qZWN0U2V0dGluZ3M6IHF1ZXJ5LWNvbmZpZyByZXR1cm5lZCBubyBkYXRhJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSByZW5kZXJQbGFpbkpzb25DbGFzcygnUHJvamVjdFNldHRpbmdzJywgcHJvamVjdFNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9rKHsgZGVmaW5pdGlvbjogdHMsIHNldHRpbmdzVHlwZTogJ1Byb2plY3RTZXR0aW5ncycgfSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFByb2plY3RTZXR0aW5nczogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBzZXR0aW5nc1R5cGU6ICR7KGFyZ3MgYXMgYW55KS5zZXR0aW5nc1R5cGV9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfaW5zdGFuY2VfcHJvcGVydGllcycsXG4gICAgICAgIHRpdGxlOiAnU2V0IGluc3RhbmNlIHByb3BlcnRpZXMgKGdlbmVyaWMpJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gR2VuZXJpYyBiYXRjaCBwcm9wZXJ0eSB3cml0ZXIgdGhhdCBkaXNwYXRjaGVzIHRvIHRoZSByaWdodCBzZXR0ZXIgYmFzZWQgb24gaW5zdGFuY2Uga2luZC4gcmVmZXJlbmNlLnR5cGUgcHJlZml4IHJvdXRlczogYXNzZXQ6KiDihpIgYXNzZXRNZXRhIHBhdGggKGludGVycHJldGVyLXZhbGlkYXRlZCk7IGNjLkNvbXBvbmVudCAvIGNvbXBvbmVudCBjaWQg4oaSIGNvbXBvbmVudCBwYXRoOyBjYy5Ob2RlIOKGkiBub2RlIHBhdGguIEZvciBzaW5nbGUta2luZCB3b3JrLCB0aGUgc3BlY2lmaWMgdG9vbHMgKGNvbXBvbmVudF9zZXRfY29tcG9uZW50X3Byb3BlcnR5IC8gYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIC8gbm9kZV9zZXRfbm9kZV9wcm9wZXJ0eSkgYXJlIHN0aWxsIHByZWZlcnJlZDsgdXNlIHRoaXMgZm9yIGhldGVyb2dlbmVvdXMgYmF0Y2hlcy4gTm90ZToga2luZC1zcGVjaWZpYyBvcHRpb25zIGxpa2UgcHJlc2VydmVDb250ZW50U2l6ZSBhcmUgbm90IGF2YWlsYWJsZSBoZXJlIOKAlCB1c2UgdGhlIGRlZGljYXRlZCB0b29scyBmb3IgdGhvc2UuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLFxuICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCksXG4gICAgICAgICAgICB9KSkubWluKDEpLm1heCg1MCksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0SW5zdGFuY2VQcm9wZXJ0aWVzKGFyZ3M6IHtcbiAgICAgICAgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZTtcbiAgICAgICAgcHJvcGVydGllczogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueSB9PjtcbiAgICB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgeyByZWZlcmVuY2UsIHByb3BlcnRpZXMgfSA9IGFyZ3M7XG4gICAgICAgIGlmICghcmVmZXJlbmNlPy5pZCkgcmV0dXJuIGZhaWwoJ2luc3BlY3Rvcl9zZXRfaW5zdGFuY2VfcHJvcGVydGllczogcmVmZXJlbmNlLmlkIGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIGNvbnN0IGFzc2V0SW5mb1Jlc3VsdCA9IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKHJlZmVyZW5jZS5pZCk7XG4gICAgICAgIGlmIChhc3NldEluZm9SZXN1bHQuYXNzZXRJbmZvIHx8IGlzQXNzZXRSZWZlcmVuY2VIaW50KHJlZmVyZW5jZSkpIHtcbiAgICAgICAgICAgIGlmICghYXNzZXRJbmZvUmVzdWx0LmFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGFzc2V0SW5mb1Jlc3VsdC5lcnJvciA/PyBgaW5zcGVjdG9yOiBhc3NldCBub3QgZm91bmQgZm9yICR7cmVmZXJlbmNlLmlkfS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFzc2V0TWV0YVRvb2xzLmV4ZWN1dGUoJ3NldF9wcm9wZXJ0aWVzJywge1xuICAgICAgICAgICAgICAgIHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdhc3NldCcsIHByb3BlcnRpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzTm9kZVJlZmVyZW5jZShyZWZlcmVuY2UpKSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5ub2RlVG9vbHMuZXhlY3V0ZSgnc2V0X25vZGVfcHJvcGVydGllcycsIHtcbiAgICAgICAgICAgICAgICByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllcy5tYXAocCA9PiAoeyBwYXRoOiBwLnBhdGgsIHZhbHVlOiBwLnZhbHVlIH0pKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZURlbGVnYXRlZEJhdGNoUmVzcG9uc2UocmVzcCwgJ25vZGUnLCBwcm9wZXJ0aWVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudFRhcmdldCA9IGF3YWl0IHJlc29sdmVDb21wb25lbnRUYXJnZXQocmVmZXJlbmNlKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gY29tcG9uZW50VGFyZ2V0KSByZXR1cm4gZmFpbChjb21wb25lbnRUYXJnZXQuZXJyb3IpO1xuICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdzZXRfY29tcG9uZW50X3Byb3BlcnRpZXMnLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY29tcG9uZW50VGFyZ2V0Lm5vZGVVdWlkLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogY29tcG9uZW50VGFyZ2V0LmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHk6IHAucGF0aCxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHAudHlwZSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogcC52YWx1ZSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVEZWxlZ2F0ZWRCYXRjaFJlc3BvbnNlKHJlc3AsICdjb21wb25lbnQnLCBwcm9wZXJ0aWVzKTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGNsYXNzIGRlY2xhcmF0aW9uLiBGb3Igbm9kZXMsIGFsc28gZW51bWVyYXRlXG4gKiBjb21wb25lbnRzIGZyb20gYF9fY29tcHNfX2AgYXMgYSBjb21tZW50IHNvIEFJIGtub3dzIHdoaWNoXG4gKiBzdWItaW5zdGFuY2VzIGV4aXN0ICh3aXRob3V0IGlubGluaW5nIHRoZWlyIGZ1bGwgVFMg4oCUIHRob3NlXG4gKiByZXF1aXJlIGEgc2VwYXJhdGUgZ2V0X2luc3RhbmNlX2RlZmluaXRpb24gY2FsbCBieSBjb21wb25lbnRcbiAqIFVVSUQpLlxuICovXG5mdW5jdGlvbiByZW5kZXJUc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBkdW1wOiBhbnksIGlzQ29tcG9uZW50OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgY2xhc3NOYW1lLCBkdW1wLCBpc0NvbXBvbmVudCk7XG4gICAgcmV0dXJuIGN0eC5kZWZpbml0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGxhaW5Kc29uQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIG9iajogUmVjb3JkPHN0cmluZywgYW55Pik6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2BjbGFzcyAke3Nhbml0aXplVHNOYW1lKGNsYXNzTmFtZSl9IHtgXTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopLnNvcnQoKSkge1xuICAgICAgICBjb25zdCBwcm9wTmFtZSA9IGlzU2FmZVRzSWRlbnRpZmllcihrZXkpID8ga2V5IDogSlNPTi5zdHJpbmdpZnkoa2V5KTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICR7cHJvcE5hbWV9OiAke3BsYWluSnNvblRvVHNUeXBlKG9ialtrZXldKX07YCk7XG4gICAgfVxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHBsYWluSnNvblRvVHNUeXBlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkgcmV0dXJuICdudWxsJztcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gJ251bWJlcic7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gYEFycmF5PCR7dmFsdWUubGVuZ3RoID4gMCA/IHBsYWluSnNvblRvVHNUeXBlKHZhbHVlWzBdKSA6ICd1bmtub3duJ30+YDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHJldHVybiAnUmVjb3JkPHN0cmluZywgdW5rbm93bj4nO1xuICAgIHJldHVybiAndW5rbm93bic7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckFzc2V0SW1wb3J0ZXJDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgYW55PiwgYXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogc3RyaW5nIHtcbiAgICBjb25zdCBjdHg6IFJlbmRlckNvbnRleHQgPSB7IGRlZmluaXRpb25zOiBbXSwgZGVmaW5lZE5hbWVzOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtgY2xhc3MgJHtzYW5pdGl6ZVRzTmFtZShjbGFzc05hbWUpfSB7YF07XG4gICAgY29uc3QgcGF0aHMgPSBuZXcgU2V0KFsuLi5PYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSwgLi4uT2JqZWN0LmtleXMoYXJyYXlzID8/IHt9KV0pO1xuICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4ucGF0aHNdLnNvcnQoKSkge1xuICAgICAgICBjb25zdCBlbnRyeSA9IHByb3BlcnRpZXNbcGF0aF07XG4gICAgICAgIGNvbnN0IHRvb2x0aXAgPSByZXNvbHZlSTE4blRleHQoZW50cnk/LnRvb2x0aXApO1xuICAgICAgICBpZiAodG9vbHRpcCAmJiB0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvKiogJHtzYW5pdGl6ZUZvckNvbW1lbnQodG9vbHRpcCl9ICovYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZW51bUxpc3QgPSBlbnVtT3JCaXRtYXNrTGlzdChlbnRyeSk7XG4gICAgICAgIGxldCB0c1R5cGU6IHN0cmluZztcbiAgICAgICAgbGV0IGRlY29yYXRvclR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKGVudW1MaXN0KSB7XG4gICAgICAgICAgICBjb25zdCBlbnVtTmFtZSA9IHBhc2NhbENhc2VOYW1lKHBhdGgpO1xuICAgICAgICAgICAgZ2VuZXJhdGVDb25zdEVudW1EZWZpbml0aW9uKGN0eCwgZW51bU5hbWUsIGVudW1MaXN0KTtcbiAgICAgICAgICAgIHRzVHlwZSA9IGVudW1OYW1lO1xuICAgICAgICAgICAgZGVjb3JhdG9yVHlwZSA9IGVudW1OYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHNUeXBlID0gcmVzb2x2ZVRzVHlwZShlbnRyeSA/PyBhcnJheXNbcGF0aF0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcnJheXMgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5cywgcGF0aCkpIHtcbiAgICAgICAgICAgIHRzVHlwZSA9IGBBcnJheTwke3RzVHlwZX0+YDtcbiAgICAgICAgICAgIGlmIChkZWNvcmF0b3JUeXBlKSBkZWNvcmF0b3JUeXBlID0gYFske2RlY29yYXRvclR5cGV9XWA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVjb3JhdG9yID0gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IoZW50cnksIGRlY29yYXRvclR5cGUpO1xuICAgICAgICBpZiAoZGVjb3JhdG9yKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtkZWNvcmF0b3J9YCk7XG4gICAgICAgIH1cbiAgICAgICAgbGluZXMucHVzaChgICAgICR7cmVuZGVyUGF0aEFzUHJvcGVydHkocGF0aCl9OiAke3RzVHlwZX07YCk7XG4gICAgfVxuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gWy4uLmN0eC5kZWZpbml0aW9ucywgbGluZXMuam9pbignXFxuJyldLmpvaW4oJ1xcblxcbicpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQYXRoQXNQcm9wZXJ0eShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBpc1NhZmVUc0lkZW50aWZpZXIocGF0aCkgPyBwYXRoIDogSlNPTi5zdHJpbmdpZnkocGF0aCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5QXNzZXRJbmZvKGlkOiBzdHJpbmcpOiBQcm9taXNlPHsgYXNzZXRJbmZvPzogYW55OyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGlkKTtcbiAgICAgICAgcmV0dXJuIGFzc2V0SW5mbyA/IHsgYXNzZXRJbmZvIH0gOiB7fTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYHF1ZXJ5LWFzc2V0LWluZm8gZmFpbGVkIGZvciAke2lkfTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlb2YgcmVmZXJlbmNlLnR5cGUgPT09ICdzdHJpbmcnICYmIHJlZmVyZW5jZS50eXBlLnN0YXJ0c1dpdGgoJ2Fzc2V0OicpO1xufVxuXG5mdW5jdGlvbiBpc05vZGVSZWZlcmVuY2UocmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHQgPSByZWZlcmVuY2UudHlwZTtcbiAgICByZXR1cm4gIXQgfHwgdCA9PT0gJ25vZGUnIHx8IHQgPT09ICdOb2RlJyB8fCB0ID09PSAnY2MuTm9kZSc7XG59XG5cbmZ1bmN0aW9uIGFzc2V0Q2xhc3NOYW1lKGFzc2V0SW5mbzogYW55LCByZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogc3RyaW5nIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcocmVmZXJlbmNlLnR5cGU/LnJlcGxhY2UoL15hc3NldDovLCAnJykgfHwgYXNzZXRJbmZvLnR5cGUgfHwgYXNzZXRJbmZvLmltcG9ydGVyIHx8ICdBc3NldCcpO1xuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShyYXcucmVwbGFjZSgvXmNjXFwuLywgJycpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudFRhcmdldChyZWZlcmVuY2U6IEluc3RhbmNlUmVmZXJlbmNlKTogUHJvbWlzZTx7IG5vZGVVdWlkOiBzdHJpbmc7IGNvbXBvbmVudFR5cGU6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0+IHtcbiAgICBjb25zdCBmb3VuZCA9IGF3YWl0IGZpbmRDb21wb25lbnRJblNjZW5lKHJlZmVyZW5jZS5pZCk7XG4gICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgaWYgKHJlZmVyZW5jZS50eXBlICYmICFpc05vZGVSZWZlcmVuY2UocmVmZXJlbmNlKSAmJiAhaXNBc3NldFJlZmVyZW5jZUhpbnQocmVmZXJlbmNlKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZHVtcDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHJlZmVyZW5jZS5pZCk7XG4gICAgICAgICAgICBpZiAoZHVtcCAmJiBBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG5vZGVVdWlkOiByZWZlcmVuY2UuaWQsIGNvbXBvbmVudFR5cGU6IHJlZmVyZW5jZS50eXBlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gUmV0dXJuIHRoZSBjb21wb25lbnQgbG9va3VwIGZhaWx1cmUgYmVsb3cuXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgZXJyb3I6IGBpbnNwZWN0b3Jfc2V0X2luc3RhbmNlX3Byb3BlcnRpZXM6IGNvdWxkIG5vdCByZXNvbHZlIGNvbXBvbmVudCByZWZlcmVuY2UgJHtyZWZlcmVuY2UuaWR9LiBQYXNzIHJlZmVyZW5jZS5pZCBhcyBhIGNvbXBvbmVudCBVVUlEIHdpdGggcmVmZXJlbmNlLnR5cGUgYXMgdGhlIGNvbXBvbmVudCBjaWQvdHlwZSwgb3IgdXNlIGNjLk5vZGUgZm9yIG5vZGUgcHJvcGVydGllcy5gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmRDb21wb25lbnRJblNjZW5lKGNvbXBvbmVudFV1aWQ6IHN0cmluZyk6IFByb21pc2U8eyBub2RlVXVpZDogc3RyaW5nOyBjb21wb25lbnRUeXBlOiBzdHJpbmcgfSB8IG51bGw+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgIGNvbnN0IHF1ZXVlOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkodHJlZSkgPyBbLi4udHJlZV0gOiBbdHJlZV07XG4gICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVVdWlkID0gaXRlbT8udXVpZD8udmFsdWUgPz8gaXRlbT8udXVpZDtcbiAgICAgICAgICAgIGlmICghbm9kZVV1aWQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBkdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkoZHVtcD8uX19jb21wc19fKSA/IGR1bXAuX19jb21wc19fIDogW107XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBjb21wPy52YWx1ZT8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHV1aWQgPT09IGNvbXBvbmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogU3RyaW5nKGNvbXA/Ll9fdHlwZV9fID8/IGNvbXA/LmNpZCA/PyBjb21wPy50eXBlID8/ICdjYy5Db21wb25lbnQnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBLZWVwIHNjYW5uaW5nIG90aGVyIG5vZGVzLlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbT8uY2hpbGRyZW4pKSBxdWV1ZS5wdXNoKC4uLml0ZW0uY2hpbGRyZW4pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRGVsZWdhdGVkQmF0Y2hSZXNwb25zZShcbiAgICByZXNwOiBUb29sUmVzcG9uc2UsXG4gICAga2luZDogJ25vZGUnIHwgJ2NvbXBvbmVudCcgfCAnYXNzZXQnLFxuICAgIHJlcXVlc3RlZDogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgdmFsdWU6IGFueSB9Pixcbik6IFRvb2xSZXNwb25zZSB7XG4gICAgY29uc3QgcmF3UmVzdWx0cyA9IEFycmF5LmlzQXJyYXkocmVzcC5kYXRhPy5yZXN1bHRzKSA/IHJlc3AuZGF0YS5yZXN1bHRzIDogbnVsbDtcbiAgICBjb25zdCByZXN1bHRzID0gcmF3UmVzdWx0c1xuICAgICAgICA/IHJhd1Jlc3VsdHMubWFwKChyOiBhbnksIGk6IG51bWJlcikgPT4gKHtcbiAgICAgICAgICAgIHBhdGg6IHIucGF0aCA/PyByLnByb3BlcnR5ID8/IHIucHJvcGVydHlQYXRoID8/IHJlcXVlc3RlZFtpXT8ucGF0aCxcbiAgICAgICAgICAgIHN1Y2Nlc3M6ICEhci5zdWNjZXNzLFxuICAgICAgICAgICAgZXJyb3I6IHIuc3VjY2VzcyA/IHVuZGVmaW5lZCA6IChyLmVycm9yID8/ICd1bmtub3duJyksXG4gICAgICAgICAgICB3YXJuaW5nOiByLndhcm5pbmcsXG4gICAgICAgIH0pKVxuICAgICAgICA6IHJlcXVlc3RlZC5tYXAocCA9PiAoe1xuICAgICAgICAgICAgcGF0aDogcC5wYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogISFyZXNwLnN1Y2Nlc3MsXG4gICAgICAgICAgICBlcnJvcjogcmVzcC5zdWNjZXNzID8gdW5kZWZpbmVkIDogKHJlc3AuZXJyb3IgPz8gcmVzcC5tZXNzYWdlID8/ICd1bmtub3duJyksXG4gICAgICAgIH0pKTtcbiAgICBjb25zdCBmYWlsZWRDb3VudCA9IHJlc3VsdHMuZmlsdGVyKChyOiBhbnkpID0+ICFyLnN1Y2Nlc3MpLmxlbmd0aDtcbiAgICBjb25zdCByZXNwb25zZTogVG9vbFJlc3BvbnNlID0ge1xuICAgICAgICBzdWNjZXNzOiByZXN1bHRzLnNvbWUoKHI6IGFueSkgPT4gci5zdWNjZXNzKSxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgICAga2luZCxcbiAgICAgICAgICAgIHRvdGFsOiByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgIGZhaWxlZENvdW50LFxuICAgICAgICAgICAgcmVzdWx0cyxcbiAgICAgICAgICAgIGRlbGVnYXRlZDogcmVzcC5kYXRhLFxuICAgICAgICB9LFxuICAgICAgICBtZXNzYWdlOiBmYWlsZWRDb3VudCA9PT0gMFxuICAgICAgICAgICAgPyBgV3JvdGUgJHtyZXN1bHRzLmxlbmd0aH0gJHtraW5kfSBwcm9wZXJ0aWVzYFxuICAgICAgICAgICAgOiBgJHtmYWlsZWRDb3VudH0vJHtyZXN1bHRzLmxlbmd0aH0gJHtraW5kfSBwcm9wZXJ0eSB3cml0ZXMgZmFpbGVkYCxcbiAgICB9O1xuICAgIGlmIChyZXNwLndhcm5pbmcpIHJlc3BvbnNlLndhcm5pbmcgPSByZXNwLndhcm5pbmc7XG4gICAgaWYgKCFyZXNwb25zZS5zdWNjZXNzKSByZXNwb25zZS5lcnJvciA9IHJlc3AuZXJyb3IgPz8gcmVzcC5tZXNzYWdlID8/IHJlc3BvbnNlLm1lc3NhZ2U7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5pbnRlcmZhY2UgUmVuZGVyQ29udGV4dCB7XG4gICAgZGVmaW5pdGlvbnM6IHN0cmluZ1tdO1xuICAgIGRlZmluZWROYW1lczogU2V0PHN0cmluZz47XG59XG5cbmludGVyZmFjZSBSZXNvbHZlZFByb3BlcnR5VHlwZSB7XG4gICAgdHNUeXBlOiBzdHJpbmc7XG4gICAgZGVjb3JhdG9yVHlwZT86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1RzQ2xhc3MoY3R4OiBSZW5kZXJDb250ZXh0LCBjbGFzc05hbWU6IHN0cmluZywgZHVtcDogYW55LCBpc0NvbXBvbmVudDogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IHNhZmVDbGFzc05hbWUgPSBzYW5pdGl6ZVRzTmFtZShTdHJpbmcoY2xhc3NOYW1lID8/ICcnKS5yZXBsYWNlKC9eY2NcXC4vLCAnJykpO1xuICAgIGlmIChjdHguZGVmaW5lZE5hbWVzLmhhcyhzYWZlQ2xhc3NOYW1lKSkgcmV0dXJuO1xuICAgIGN0eC5kZWZpbmVkTmFtZXMuYWRkKHNhZmVDbGFzc05hbWUpO1xuXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgbGluZXMucHVzaChgY2xhc3MgJHtzYWZlQ2xhc3NOYW1lfSR7aXNDb21wb25lbnQgPyAnIGV4dGVuZHMgQ29tcG9uZW50JyA6ICcnfSB7YCk7XG5cbiAgICBpZiAoZHVtcCAmJiB0eXBlb2YgZHVtcCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZm9yIChjb25zdCBwcm9wTmFtZSBvZiBPYmplY3Qua2V5cyhkdW1wKSkge1xuICAgICAgICAgICAgaWYgKE5PREVfRFVNUF9JTlRFUk5BTF9LRVlTLmhhcyhwcm9wTmFtZSkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcHJvcEVudHJ5ID0gZHVtcFtwcm9wTmFtZV07XG4gICAgICAgICAgICBpZiAocHJvcEVudHJ5ID09PSB1bmRlZmluZWQgfHwgcHJvcEVudHJ5ID09PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgIC8vIENvY29zIGR1bXAgZW50cmllcyBhcmUgdHlwaWNhbGx5IGB7dHlwZSwgdmFsdWUsIHZpc2libGU/LCByZWFkb25seT8sIC4uLn1gLlxuICAgICAgICAgICAgLy8gU2tpcCBleHBsaWNpdGx5LWhpZGRlbiBpbnNwZWN0b3IgZmllbGRzOyB0aGV5J3JlIG5vdCB1c2VyLWZhY2luZy5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgcHJvcEVudHJ5ID09PSAnb2JqZWN0JyAmJiBwcm9wRW50cnkudmlzaWJsZSA9PT0gZmFsc2UpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUc1Byb3BlcnR5VHlwZShjdHgsIHNhZmVDbGFzc05hbWUsIHByb3BOYW1lLCBwcm9wRW50cnkpO1xuICAgICAgICAgICAgY29uc3QgcmVhZG9ubHkgPSBwcm9wRW50cnk/LnJlYWRvbmx5ID8gJ3JlYWRvbmx5ICcgOiAnJztcbiAgICAgICAgICAgIGNvbnN0IHRvb2x0aXBTcmM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHByb3BFbnRyeT8udG9vbHRpcDtcbiAgICAgICAgICAgIGNvbnN0IHRvb2x0aXAgPSByZXNvbHZlSTE4blRleHQodG9vbHRpcFNyYyk7XG4gICAgICAgICAgICBpZiAodG9vbHRpcCAmJiB0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgLyoqICR7c2FuaXRpemVGb3JDb21tZW50KHRvb2x0aXApfSAqL2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGVjb3JhdG9yID0gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IocHJvcEVudHJ5LCByZXNvbHZlZC5kZWNvcmF0b3JUeXBlKTtcbiAgICAgICAgICAgIGlmIChkZWNvcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtkZWNvcmF0b3J9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzYWZlUHJvcE5hbWUgPSBpc1NhZmVUc0lkZW50aWZpZXIocHJvcE5hbWUpID8gcHJvcE5hbWUgOiBKU09OLnN0cmluZ2lmeShwcm9wTmFtZSk7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGAgICAgJHtyZWFkb25seX0ke3NhZmVQcm9wTmFtZX06ICR7cmVzb2x2ZWQudHNUeXBlfTtgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNDb21wb25lbnQgJiYgQXJyYXkuaXNBcnJheShkdW1wPy5fX2NvbXBzX18pICYmIGR1bXAuX19jb21wc19fLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgICAvLyBDb21wb25lbnRzIG9uIHRoaXMgbm9kZSAoaW5zcGVjdCBlYWNoIHNlcGFyYXRlbHkgdmlhIGdldF9pbnN0YW5jZV9kZWZpbml0aW9uIHdpdGggdGhlIGhvc3Qgbm9kZSBVVUlEIGZpcnN0KTonKTtcbiAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGR1bXAuX19jb21wc19fKSB7XG4gICAgICAgICAgICBjb25zdCBjVHlwZSA9IHNhbml0aXplRm9yQ29tbWVudChTdHJpbmcoY29tcD8uX190eXBlX18gPz8gY29tcD8udHlwZSA/PyAndW5rbm93bicpKTtcbiAgICAgICAgICAgIGNvbnN0IGNVdWlkID0gc2FuaXRpemVGb3JDb21tZW50KFN0cmluZyhjb21wPy52YWx1ZT8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZD8udmFsdWUgPz8gY29tcD8udXVpZCA/PyAnPycpKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgICAvLyAtICR7Y1R5cGV9ICB1dWlkPSR7Y1V1aWR9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgY3R4LmRlZmluaXRpb25zLnB1c2gobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogdG9vbHRpcHMgYW5kIGNvbXBvbmVudCBtZXRhZGF0YSBjYW5cbi8vIGNvbnRhaW4gYCovYCAoY2xvc2VzIHRoZSBkb2MgY29tbWVudCksIGBcXG5gIChicmVha3MgYSBgLy9gIGNvbW1lbnRcbi8vIGludG8gc3RyYXkgY29kZSksIG9yIGBcXHJgLiBTaW5nbGUtbGluZS1jb21tZW50IGNvbnRleHQgaXMgdGhlXG4vLyBkYW5nZXJvdXMgb25lLiBTdHJpcCBib3RoLlxuZnVuY3Rpb24gc2FuaXRpemVGb3JDb21tZW50KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRleHRcbiAgICAgICAgLnJlcGxhY2UoL1xcKlxcLy9nLCAnKlxcXFwvJylcbiAgICAgICAgLnJlcGxhY2UoL1xccj9cXG4vZywgJyAnKVxuICAgICAgICAucmVwbGFjZSgvXFxyL2csICcgJyk7XG59XG5cbi8vIHYyLjQuMSByZXZpZXcgZml4IChjbGF1ZGUpOiB1bnNhbml0aXplZCBjdXN0b20tc2NyaXB0IGNsYXNzIG5hbWVzXG4vLyAoZS5nLiBgTXkuRm9vYCwgYE15LUZvb2ApIGVtaXR0ZWQgZGlyZWN0bHkgaW50byB0aGUgVFMgb3V0cHV0IHByb2R1Y2Vcbi8vIGludmFsaWQgVFMuIEpTT04tc3RyaW5naWZ5IGFueSBwcm9wZXJ0eSBuYW1lIHRoYXQgaXNuJ3QgYSBwbGFpbiBpZGVudC5cbmZ1bmN0aW9uIGlzU2FmZVRzSWRlbnRpZmllcihuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gL15bQS1aYS16XyRdW0EtWmEtejAtOV8kXSokLy50ZXN0KG5hbWUpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVHNQcm9wZXJ0eVR5cGUoY3R4OiBSZW5kZXJDb250ZXh0LCBvd25lckNsYXNzTmFtZTogc3RyaW5nLCBwcm9wTmFtZTogc3RyaW5nLCBlbnRyeTogYW55KTogUmVzb2x2ZWRQcm9wZXJ0eVR5cGUge1xuICAgIGNvbnN0IGlzQXJyYXkgPSAhIWVudHJ5Py5pc0FycmF5O1xuICAgIGNvbnN0IGl0ZW1FbnRyeSA9IGlzQXJyYXkgPyBhcnJheUl0ZW1FbnRyeShlbnRyeSkgOiBlbnRyeTtcbiAgICBjb25zdCBlbnVtTGlzdCA9IGVudW1PckJpdG1hc2tMaXN0KGl0ZW1FbnRyeSkgPz8gZW51bU9yQml0bWFza0xpc3QoZW50cnkpO1xuICAgIGlmIChlbnVtTGlzdCkge1xuICAgICAgICBjb25zdCBlbnVtTmFtZSA9IHBhc2NhbENhc2VOYW1lKHByb3BOYW1lKTtcbiAgICAgICAgZ2VuZXJhdGVDb25zdEVudW1EZWZpbml0aW9uKGN0eCwgZW51bU5hbWUsIGVudW1MaXN0KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHRzVHlwZTogaXNBcnJheSA/IGBBcnJheTwke2VudW1OYW1lfT5gIDogZW51bU5hbWUsXG4gICAgICAgICAgICBkZWNvcmF0b3JUeXBlOiBpc0FycmF5ID8gYFske2VudW1OYW1lfV1gIDogZW51bU5hbWUsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3RydWN0VmFsdWUgPSBuZXN0ZWRTdHJ1Y3RWYWx1ZShpdGVtRW50cnkpO1xuICAgIGlmIChzdHJ1Y3RWYWx1ZSAmJiAhaXNDb21tb25WYWx1ZVR5cGUoaXRlbUVudHJ5Py50eXBlKSAmJiAhaXNSZWZlcmVuY2VFbnRyeShpdGVtRW50cnkpKSB7XG4gICAgICAgIGNvbnN0IHN0cnVjdE5hbWUgPSBuZXN0ZWRTdHJ1Y3RDbGFzc05hbWUob3duZXJDbGFzc05hbWUsIHByb3BOYW1lLCBzdHJ1Y3RWYWx1ZSwgaXNBcnJheSk7XG4gICAgICAgIHByb2Nlc3NUc0NsYXNzKGN0eCwgc3RydWN0TmFtZSwgc3RydWN0VmFsdWUsIGZhbHNlKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHRzVHlwZTogaXNBcnJheSA/IGBBcnJheTwke3N0cnVjdE5hbWV9PmAgOiBzdHJ1Y3ROYW1lLFxuICAgICAgICAgICAgZGVjb3JhdG9yVHlwZTogaXNBcnJheSA/IGBbJHtzdHJ1Y3ROYW1lfV1gIDogc3RydWN0TmFtZSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCB0c1R5cGUgPSByZXNvbHZlVHNUeXBlKGl0ZW1FbnRyeSk7XG4gICAgcmV0dXJuIHsgdHNUeXBlOiBpc0FycmF5ID8gYEFycmF5PCR7dHNUeXBlfT5gIDogdHNUeXBlIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUc1R5cGUoZW50cnk6IGFueSk6IHN0cmluZyB7XG4gICAgaWYgKGVudHJ5ID09PSB1bmRlZmluZWQgfHwgZW50cnkgPT09IG51bGwpIHJldHVybiAndW5rbm93bic7XG4gICAgLy8gUGxhaW4gcHJpbWl0aXZlcyBwYXNzZWQgdGhyb3VnaCBkaXJlY3RseSAocmFyZSBpbiBkdW1wIHNoYXBlKS5cbiAgICBjb25zdCB0dCA9IHR5cGVvZiBlbnRyeTtcbiAgICBpZiAodHQgPT09ICdzdHJpbmcnKSByZXR1cm4gJ3N0cmluZyc7XG4gICAgaWYgKHR0ID09PSAnbnVtYmVyJykgcmV0dXJuICdudW1iZXInO1xuICAgIGlmICh0dCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xuXG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nID0gZW50cnkudHlwZSA/PyBlbnRyeS5fX3R5cGVfXyA/PyAnJztcblxuICAgIGxldCB0czogc3RyaW5nO1xuICAgIHN3aXRjaCAocmF3VHlwZSkge1xuICAgICAgICBjYXNlICdTdHJpbmcnOiB0cyA9ICdzdHJpbmcnOyBicmVhaztcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6IHRzID0gJ2Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICBjYXNlICdCaXRNYXNrJzogdHMgPSAnbnVtYmVyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzInOiB0cyA9ICdWZWMyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzMnOiB0cyA9ICdWZWMzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLlZlYzQnOiB0cyA9ICdWZWM0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NjLkNvbG9yJzogdHMgPSAnQ29sb3InOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUmVjdCc6IHRzID0gJ1JlY3QnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuU2l6ZSc6IHRzID0gJ1NpemUnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuUXVhdCc6IHRzID0gJ1F1YXQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0Myc6IHRzID0gJ01hdDMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnY2MuTWF0NCc6IHRzID0gJ01hdDQnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJzogdHMgPSAndW5rbm93bic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyB2Mi40LjEgcmV2aWV3IGZpeCAoY2xhdWRlKTogc2FuaXRpemUgY3VzdG9tIGNsYXNzIG5hbWVzXG4gICAgICAgICAgICAvLyBiZWZvcmUgcGFzdGluZyB0aGVtIGludG8gdGhlIFRTIG91dHB1dC4gYE15LkZvb2AgZXRjLlxuICAgICAgICAgICAgLy8gd291bGQgYmUgaW52YWxpZCBUUyBvdGhlcndpc2UuXG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZFR5cGUgPSBzYW5pdGl6ZVRzTmFtZShyYXdUeXBlLnJlcGxhY2UoL15jY1xcLi8sICcnKSkgfHwgJ3Vua25vd24nO1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ05vZGUnXG4gICAgICAgICAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ0NvbXBvbmVudCdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuQ29tcG9uZW50J1xuICAgICAgICAgICAgICAgIHx8IHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICB0cyA9IGlzUmVmZXJlbmNlID8gYEluc3RhbmNlUmVmZXJlbmNlPCR7c3RyaXBwZWRUeXBlfT5gIDogc3RyaXBwZWRUeXBlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cztcbn1cblxuZnVuY3Rpb24gcmVuZGVyUHJvcGVydHlEZWNvcmF0b3IoZW50cnk6IGFueSwgcmVzb2x2ZWRUeXBlPzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHR5cGVFeHByID0gcmVzb2x2ZWRUeXBlID8/IGRlY29yYXRvclR5cGVFeHByZXNzaW9uKGVudHJ5KTtcbiAgICBjb25zdCBoYXNFbnVtT3JCaXRtYXNrTGlzdCA9IGVudW1PckJpdG1hc2tMaXN0KGVudHJ5KSAhPT0gbnVsbFxuICAgICAgICB8fCBlbnVtT3JCaXRtYXNrTGlzdChhcnJheUl0ZW1FbnRyeShlbnRyeSkpICE9PSBudWxsO1xuICAgIGlmICgoZW50cnkudHlwZSAhPT0gdW5kZWZpbmVkIHx8IGhhc0VudW1PckJpdG1hc2tMaXN0KSAmJiB0eXBlRXhwcikge1xuICAgICAgICBwYXJ0cy5wdXNoKGB0eXBlOiAke3R5cGVFeHByfWApO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgYXR0ciBvZiBbJ21pbicsICdtYXgnLCAnc3RlcCcsICd1bml0JywgJ3JhZGlhbicsICdtdWx0aWxpbmUnLCAndG9vbHRpcCddKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZW50cnlbYXR0cl07XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGAke2F0dHJ9OiAke2RlY29yYXRvclZhbHVlKGF0dHIgPT09ICd0b29sdGlwJyB8fCBhdHRyID09PSAnZGlzcGxheU5hbWUnID8gcmVzb2x2ZUkxOG5UZXh0KHZhbHVlKSA6IHZhbHVlKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIHJldHVybiBgQHByb3BlcnR5KHsgJHtwYXJ0cy5qb2luKCcsICcpfSB9KWA7XG59XG5cbmZ1bmN0aW9uIGRlY29yYXRvclR5cGVFeHByZXNzaW9uKGVudHJ5OiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBpc0FycmF5ID0gISFlbnRyeT8uaXNBcnJheTtcbiAgICBjb25zdCBpdGVtRW50cnkgPSBpc0FycmF5ID8gYXJyYXlJdGVtRW50cnkoZW50cnkpIDogZW50cnk7XG4gICAgY29uc3QgcmF3VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gaXRlbUVudHJ5Py50eXBlO1xuICAgIGlmICghcmF3VHlwZSkgcmV0dXJuIG51bGw7XG5cbiAgICBsZXQgZXhwcjogc3RyaW5nIHwgbnVsbDtcbiAgICBzd2l0Y2ggKHJhd1R5cGUpIHtcbiAgICAgICAgY2FzZSAnSW50ZWdlcic6IGV4cHIgPSAnQ0NJbnRlZ2VyJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0Zsb2F0JzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzogZXhwciA9ICdDQ0Zsb2F0JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6IGV4cHIgPSAnU3RyaW5nJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOiBleHByID0gJ0Jvb2xlYW4nOyBicmVhaztcbiAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgIGNhc2UgJ0JpdE1hc2snOiBleHByID0gJ051bWJlcic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiBleHByID0gc2FuaXRpemVUc05hbWUocmF3VHlwZS5yZXBsYWNlKC9eY2NcXC4vLCAnJykpO1xuICAgIH1cbiAgICBpZiAoIWV4cHIpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBpc0FycmF5ID8gYFske2V4cHJ9XWAgOiBleHByO1xufVxuXG5mdW5jdGlvbiBkZWNvcmF0b3JWYWx1ZSh2YWx1ZTogYW55KTogc3RyaW5nIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUkxOG5UZXh0KHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8ICF2YWx1ZS5zdGFydHNXaXRoKCdpMThuOicpKSByZXR1cm4gdmFsdWU7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdHJhbnNsYXRlZCA9IEVkaXRvci5JMThuLnQodmFsdWUuc2xpY2UoNSkpO1xuICAgICAgICBpZiAodHlwZW9mIHRyYW5zbGF0ZWQgPT09ICdzdHJpbmcnICYmIHRyYW5zbGF0ZWQudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0cmFuc2xhdGVkO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEtlZXAgb3JpZ2luYWwgaTE4biBrZXkgd2hlbiBlZGl0b3IgbG9jYWxpemF0aW9uIGlzIHVuYXZhaWxhYmxlLlxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGFycmF5SXRlbUVudHJ5KGVudHJ5OiBhbnkpOiBhbnkge1xuICAgIGlmIChlbnRyeT8uZWxlbWVudFR5cGVEYXRhKSByZXR1cm4gZW50cnkuZWxlbWVudFR5cGVEYXRhO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudHJ5Py52YWx1ZSkgJiYgZW50cnkudmFsdWUubGVuZ3RoID4gMCkgcmV0dXJuIGVudHJ5LnZhbHVlWzBdO1xuICAgIHJldHVybiBlbnRyeTtcbn1cblxuZnVuY3Rpb24gZW51bU9yQml0bWFza0xpc3QoZW50cnk6IGFueSk6IGFueVtdIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShlbnRyeS5lbnVtTGlzdCkgPyBlbnRyeS5lbnVtTGlzdFxuICAgICAgICA6IEFycmF5LmlzQXJyYXkoZW50cnkuYml0bWFza0xpc3QpID8gZW50cnkuYml0bWFza0xpc3RcbiAgICAgICAgOiBBcnJheS5pc0FycmF5KGVudHJ5Py51c2VyRGF0YT8uZW51bUxpc3QpID8gZW50cnkudXNlckRhdGEuZW51bUxpc3RcbiAgICAgICAgOiBBcnJheS5pc0FycmF5KGVudHJ5Py51c2VyRGF0YT8uYml0bWFza0xpc3QpID8gZW50cnkudXNlckRhdGEuYml0bWFza0xpc3RcbiAgICAgICAgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnN0RW51bURlZmluaXRpb24oY3R4OiBSZW5kZXJDb250ZXh0LCBlbnVtTmFtZTogc3RyaW5nLCBpdGVtczogYW55W10pOiB2b2lkIHtcbiAgICBjb25zdCBzYWZlRW51bU5hbWUgPSBzYW5pdGl6ZVRzTmFtZShlbnVtTmFtZSk7XG4gICAgaWYgKGN0eC5kZWZpbmVkTmFtZXMuaGFzKHNhZmVFbnVtTmFtZSkpIHJldHVybjtcbiAgICBjdHguZGVmaW5lZE5hbWVzLmFkZChzYWZlRW51bU5hbWUpO1xuXG4gICAgY29uc3QgdXNlZE1lbWJlck5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2Bjb25zdCBlbnVtICR7c2FmZUVudW1OYW1lfSB7YF07XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3QgcmF3TmFtZSA9IGl0ZW0/Lm5hbWUgPz8gaXRlbT8uZGlzcGxheU5hbWUgPz8gaXRlbT8udmFsdWUgPz8gYFZhbHVlJHtpbmRleH1gO1xuICAgICAgICBsZXQgbWVtYmVyTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyhyYXdOYW1lKSk7XG4gICAgICAgIGlmICh1c2VkTWVtYmVyTmFtZXMuaGFzKG1lbWJlck5hbWUpKSB7XG4gICAgICAgICAgICBtZW1iZXJOYW1lID0gYCR7bWVtYmVyTmFtZX1fJHtpbmRleH1gO1xuICAgICAgICB9XG4gICAgICAgIHVzZWRNZW1iZXJOYW1lcy5hZGQobWVtYmVyTmFtZSk7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gaXRlbT8udmFsdWU7XG4gICAgICAgIGNvbnN0IGluaXRpYWxpemVyID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSlcbiAgICAgICAgICAgIDogdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJ1xuICAgICAgICAgICAgICAgID8gU3RyaW5nKHZhbHVlKVxuICAgICAgICAgICAgICAgIDogU3RyaW5nKGluZGV4KTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICR7bWVtYmVyTmFtZX0gPSAke2luaXRpYWxpemVyfSxgKTtcbiAgICB9KTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgY3R4LmRlZmluaXRpb25zLnB1c2gobGluZXMuam9pbignXFxuJykpO1xufVxuXG5mdW5jdGlvbiBuZXN0ZWRTdHJ1Y3RWYWx1ZShlbnRyeTogYW55KTogYW55IHwgbnVsbCB7XG4gICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB2YWx1ZSA9IGVudHJ5LnZhbHVlO1xuICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSAmJiAnX190eXBlX18nIGluIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgaWYgKCdfX3R5cGVfXycgaW4gZW50cnkgJiYgISgndHlwZScgaW4gZW50cnkpKSB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIG5lc3RlZFN0cnVjdENsYXNzTmFtZShvd25lckNsYXNzTmFtZTogc3RyaW5nLCBwcm9wTmFtZTogc3RyaW5nLCB2YWx1ZTogYW55LCBpc0FycmF5OiBib29sZWFuKTogc3RyaW5nIHtcbiAgICBjb25zdCB0eXBlTmFtZSA9IHNhbml0aXplVHNOYW1lKFN0cmluZyh2YWx1ZT8uX190eXBlX18gPz8gJycpLnJlcGxhY2UoL15jY1xcLi8sICcnKSk7XG4gICAgaWYgKHR5cGVOYW1lICYmIHR5cGVOYW1lICE9PSAnX1Vua25vd24nICYmIHR5cGVOYW1lICE9PSAnT2JqZWN0Jykge1xuICAgICAgICByZXR1cm4gdHlwZU5hbWU7XG4gICAgfVxuICAgIHJldHVybiBzYW5pdGl6ZVRzTmFtZShgJHtvd25lckNsYXNzTmFtZX0ke3Bhc2NhbENhc2VOYW1lKHByb3BOYW1lKX0ke2lzQXJyYXkgPyAnSXRlbScgOiAnVHlwZSd9YCk7XG59XG5cbmZ1bmN0aW9uIGlzQ29tbW9uVmFsdWVUeXBlKHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0eXBlID09PSAnY2MuVmVjMidcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlZlYzMnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5WZWM0J1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuQ29sb3InXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5SZWN0J1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuU2l6ZSdcbiAgICAgICAgfHwgdHlwZSA9PT0gJ2NjLlF1YXQnXG4gICAgICAgIHx8IHR5cGUgPT09ICdjYy5NYXQzJ1xuICAgICAgICB8fCB0eXBlID09PSAnY2MuTWF0NCc7XG59XG5cbmZ1bmN0aW9uIGlzUmVmZXJlbmNlRW50cnkoZW50cnk6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJhd1R5cGU6IHN0cmluZyA9IGVudHJ5LnR5cGUgPz8gZW50cnkuX190eXBlX18gPz8gJyc7XG4gICAgY29uc3QgZXh0ZW5kc0xpc3Q6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShlbnRyeS5leHRlbmRzKSA/IGVudHJ5LmV4dGVuZHMgOiBbXTtcbiAgICByZXR1cm4gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLk9iamVjdCcpXG4gICAgICAgIHx8IHJhd1R5cGUgPT09ICdOb2RlJ1xuICAgICAgICB8fCByYXdUeXBlID09PSAnQ29tcG9uZW50J1xuICAgICAgICB8fCByYXdUeXBlID09PSAnY2MuTm9kZSdcbiAgICAgICAgfHwgcmF3VHlwZSA9PT0gJ2NjLkNvbXBvbmVudCdcbiAgICAgICAgfHwgKHJhd1R5cGUuc3RhcnRzV2l0aCgnY2MuJykgJiYgIWlzQ29tbW9uVmFsdWVUeXBlKHJhd1R5cGUpKTtcbn1cblxuZnVuY3Rpb24gcGFzY2FsQ2FzZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB3b3JkcyA9IFN0cmluZyhuYW1lID8/ICcnKVxuICAgICAgICAucmVwbGFjZSgvKFthLXowLTldKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgLnNwbGl0KC9bXkEtWmEtejAtOV0rLylcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICBjb25zdCBwYXNjYWwgPSB3b3Jkcy5tYXAoKHdvcmQpID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKS5qb2luKCcnKTtcbiAgICByZXR1cm4gc2FuaXRpemVUc05hbWUocGFzY2FsIHx8IG5hbWUgfHwgJ1ZhbHVlJyk7XG59XG5cbmZ1bmN0aW9uIGlzQ29tcG9uZW50RHVtcChkdW1wOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIWR1bXAgfHwgdHlwZW9mIGR1bXAgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VHlwZSA9IFN0cmluZyhkdW1wLl9fdHlwZV9fID8/IGR1bXAudHlwZSA/PyAnJyk7XG4gICAgaWYgKHJhd1R5cGUgPT09ICdOb2RlJyB8fCByYXdUeXBlID09PSAnY2MuTm9kZScpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBleHRlbmRzTGlzdDogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KGR1bXAuZXh0ZW5kcykgPyBkdW1wLmV4dGVuZHMgOiBbXTtcbiAgICByZXR1cm4gZXh0ZW5kc0xpc3QuaW5jbHVkZXMoJ2NjLkNvbXBvbmVudCcpIHx8ICFBcnJheS5pc0FycmF5KGR1bXAuX19jb21wc19fKTtcbn1cblxuLy8gdjIuNC4yIHJldmlldyBmaXggKGNvZGV4KTogdGhlIHYyLjQuMSBpbXBsZW1lbnRhdGlvbiBvbmx5IHN0cmlwcGVkXG4vLyBub24taWRlbnRpZmllciBjaGFyYWN0ZXJzIGJ1dCBkaWRuJ3QgZ3VhcmQgYWdhaW5zdCBhIGRpZ2l0LWxlYWRpbmdcbi8vIHJlc3VsdCAoYGNsYXNzIDJkU3ByaXRlYCkgb3IgYW4gZW1wdHkgcmVzdWx0IChhZnRlciBzdHJpcHBpbmcgYWxsXG4vLyBjaGFycyBpbiBhIFVVSUQtc2hhcGVkIF9fdHlwZV9fKS4gQm90aCBwcm9kdWNlIGludmFsaWQgVFMuIFByZWZpeFxuLy8gZGlnaXQtbGVhZGluZyBhbmQgZW1wdHkgY2FzZXMgd2l0aCBgX2AgLyBgX1Vua25vd25gLlxuZnVuY3Rpb24gc2FuaXRpemVUc05hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBjbGVhbmVkID0gU3RyaW5nKG5hbWUgPz8gJycpLnJlcGxhY2UoL1teYS16QS1aMC05X10vZywgJ18nKTtcbiAgICBpZiAoY2xlYW5lZC5sZW5ndGggPT09IDApIHJldHVybiAnX1Vua25vd24nO1xuICAgIGlmICgvXlswLTldLy50ZXN0KGNsZWFuZWQpKSByZXR1cm4gYF8ke2NsZWFuZWR9YDtcbiAgICByZXR1cm4gY2xlYW5lZDtcbn1cbiJdfQ==