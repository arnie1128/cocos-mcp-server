import { ok, fail } from '../lib/response';
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

import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { instanceReferenceSchema, InstanceReference } from '../lib/instance-reference';
import { AssetMetaTools } from './asset-meta-tools';
import { ComponentTools } from './component-tools';
import { NodeTools } from './node-tools';

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

export class InspectorTools implements ToolExecutor {
    private readonly exec: ToolExecutor;
    private readonly assetMetaTools = new AssetMetaTools();
    private readonly componentTools = new ComponentTools();
    private readonly nodeTools = new NodeTools();

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'get_common_types_definition',
        title: 'Read cocos common types',
        description: '[specialist] Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: z.object({}),
    })
    async getCommonTypesDefinition(): Promise<ToolResponse> {
        return ok({ definition: COMMON_TYPES_DEFINITION });
    }

    @mcpTool({
        name: 'get_instance_definition',
        title: 'Read instance TS definition',
        description: '[specialist] Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. Supports both node and component instance dumps including @property decorators and enum types.',
        inputSchema: z.object({
            reference: instanceReferenceSchema.describe('Target node or component. {id} = instance UUID, {type} optional cc class label.'),
        }),
    })
    async getInstanceDefinition(args: { reference: InstanceReference }): Promise<ToolResponse> {
        const { reference } = args;
        if (!reference?.id) {
            return fail('inspector_get_instance_definition: reference.id is required');
        }
        const assetInfoResult = await queryAssetInfo(reference.id);
        if (assetInfoResult.assetInfo || isAssetReferenceHint(reference)) {
            if (!assetInfoResult.assetInfo) {
                return fail(assetInfoResult.error ?? `inspector: asset not found for ${reference.id}.`);
            }
            return this.getAssetInstanceDefinition(reference, assetInfoResult.assetInfo);
        }
        try {
            const dump: any = await Editor.Message.request('scene', 'query-node', reference.id);
            if (!dump) {
                return fail(`inspector: query-node returned no dump for ${reference.id}.`);
            }
            // v2.4.2 review fix (codex): trust the dump's __type__, not
            // the caller-supplied reference.type. A caller passing
            // {id: nodeUuid, type: 'cc.Sprite'} otherwise got a node
            // dump rendered as `class Sprite`, mislabelling the
            // declaration entirely. reference.type is now diagnostic
            // only — surfaced in the response data so callers can see
            // a mismatch but never used as the class name.
            const dumpType = String(dump.__type__ ?? dump.type ?? 'CocosInstance');
            const className = dumpType.replace(/^cc\./, '');
            const referenceTypeMismatch = reference.type
                && reference.type !== dumpType
                && reference.type.replace(/^cc\./, '') !== className;
            const ts = renderTsClass(className, dump, isComponentDump(dump));
            const response: ToolResponse = {
                success: true,
                data: {
                    reference: { id: reference.id, type: dump.__type__ ?? reference.type },
                    kind: isComponentDump(dump) ? 'component' : 'node',
                    definition: ts,
                },
            };
            if (referenceTypeMismatch) {
                response.warning = `inspector: reference.type (${reference.type}) does not match dump __type__ (${dumpType}); class label uses the dump value`;
            }
            return response;
        } catch (err: any) {
            return fail(`inspector: query-node failed: ${err?.message ?? String(err)}`);
        }
    }

    private async getAssetInstanceDefinition(reference: InstanceReference, assetInfo: any): Promise<ToolResponse> {
        const resp = await this.assetMetaTools.execute('get_properties', {
            reference,
            includeTooltips: true,
            useAdvancedInspection: false,
        });
        if (!resp.success) return resp;
        const className = `${assetClassName(assetInfo, reference)}Importer`;
        const ts = renderAssetImporterClass(className, resp.data?.properties ?? {}, resp.data?.arrays ?? {});
        return ok({
            reference: { id: reference.id, type: reference.type ?? assetInfo.type },
            kind: 'asset',
            importer: assetInfo.importer,
            definition: ts,
        });
    }

    @mcpTool({
        name: 'get_settings_definition',
        title: 'Read settings TS definition',
        description: '[specialist] Generate a TypeScript class declaration for editor settings dumps. settingsType selects which dump: CommonTypes returns the common cocos value types; CurrentSceneGlobals dumps current scene globals; ProjectSettings dumps cocos project settings categories.',
        inputSchema: z.object({
            settingsType: z.enum(['CommonTypes', 'CurrentSceneGlobals', 'ProjectSettings']).describe('Which settings dump to render.'),
        }),
    })
    async getSettingsDefinition(args: { settingsType: 'CommonTypes' | 'CurrentSceneGlobals' | 'ProjectSettings' }): Promise<ToolResponse> {
        switch (args.settingsType) {
            case 'CommonTypes':
                return ok({ definition: COMMON_TYPES_DEFINITION });
            case 'CurrentSceneGlobals':
                return fail('settings introspection for CurrentSceneGlobals not yet wired — pending cocos channel research.');
            case 'ProjectSettings':
                return fail('ProjectSettings introspection not yet wired — pending cocos channel research.');
            default:
                return fail(`Unknown settingsType: ${(args as any).settingsType}`);
        }
    }

    @mcpTool({
        name: 'set_instance_properties',
        title: 'Set instance properties (generic)',
        description: '[specialist] Generic batch property writer that dispatches to the right setter based on instance kind. reference.type prefix routes: asset:* → assetMeta path (interpreter-validated); cc.Component / component cid → component path; cc.Node → node path. For single-kind work, the specific tools (component_set_component_property / assetMeta_set_properties / node_set_node_property) are still preferred; use this for heterogeneous batches. Note: kind-specific options like preserveContentSize are not available here — use the dedicated tools for those.',
        inputSchema: z.object({
            reference: instanceReferenceSchema,
            properties: z.array(z.object({
                path: z.string(),
                type: z.string(),
                value: z.any(),
            })).min(1).max(50),
        }),
    })
    async setInstanceProperties(args: {
        reference: InstanceReference;
        properties: Array<{ path: string; type: string; value: any }>;
    }): Promise<ToolResponse> {
        const { reference, properties } = args;
        if (!reference?.id) return fail('inspector_set_instance_properties: reference.id is required');
        const assetInfoResult = await queryAssetInfo(reference.id);
        if (assetInfoResult.assetInfo || isAssetReferenceHint(reference)) {
            if (!assetInfoResult.assetInfo) {
                return fail(assetInfoResult.error ?? `inspector: asset not found for ${reference.id}.`);
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
        if ('error' in componentTarget) return fail(componentTarget.error);
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

/**
 * Render a single class declaration. For nodes, also enumerate
 * components from `__comps__` as a comment so AI knows which
 * sub-instances exist (without inlining their full TS — those
 * require a separate get_instance_definition call by component
 * UUID).
 */
function renderTsClass(className: string, dump: any, isComponent: boolean): string {
    const ctx: RenderContext = { definitions: [], definedNames: new Set<string>() };
    processTsClass(ctx, className, dump, isComponent);
    return ctx.definitions.join('\n\n');
}

function renderAssetImporterClass(className: string, properties: Record<string, any>, arrays: Record<string, any>): string {
    const ctx: RenderContext = { definitions: [], definedNames: new Set<string>() };
    const lines: string[] = [`class ${sanitizeTsName(className)} {`];
    const paths = new Set([...Object.keys(properties), ...Object.keys(arrays ?? {})]);
    for (const path of [...paths].sort()) {
        const entry = properties[path];
        const tooltip = resolveI18nText(entry?.tooltip);
        if (tooltip && typeof tooltip === 'string') {
            lines.push(`    /** ${sanitizeForComment(tooltip)} */`);
        }
        const enumList = enumOrBitmaskList(entry);
        let tsType: string;
        let decoratorType: string | undefined;
        if (enumList) {
            const enumName = pascalCaseName(path);
            generateConstEnumDefinition(ctx, enumName, enumList);
            tsType = enumName;
            decoratorType = enumName;
        } else {
            tsType = resolveTsType(entry ?? arrays[path]);
        }
        if (arrays && Object.prototype.hasOwnProperty.call(arrays, path)) {
            tsType = `Array<${tsType}>`;
            if (decoratorType) decoratorType = `[${decoratorType}]`;
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

function renderPathAsProperty(path: string): string {
    return isSafeTsIdentifier(path) ? path : JSON.stringify(path);
}

async function queryAssetInfo(id: string): Promise<{ assetInfo?: any; error?: string }> {
    try {
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', id);
        return assetInfo ? { assetInfo } : {};
    } catch (err: any) {
        return { error: `query-asset-info failed for ${id}: ${err?.message ?? String(err)}` };
    }
}

function isAssetReferenceHint(reference: InstanceReference): boolean {
    return typeof reference.type === 'string' && reference.type.startsWith('asset:');
}

function isNodeReference(reference: InstanceReference): boolean {
    const t = reference.type;
    return !t || t === 'node' || t === 'Node' || t === 'cc.Node';
}

function assetClassName(assetInfo: any, reference: InstanceReference): string {
    const raw = String(reference.type?.replace(/^asset:/, '') || assetInfo.type || assetInfo.importer || 'Asset');
    return sanitizeTsName(raw.replace(/^cc\./, ''));
}

async function resolveComponentTarget(reference: InstanceReference): Promise<{ nodeUuid: string; componentType: string } | { error: string }> {
    const found = await findComponentInScene(reference.id);
    if (found) return found;
    if (reference.type && !isNodeReference(reference) && !isAssetReferenceHint(reference)) {
        try {
            const dump: any = await Editor.Message.request('scene', 'query-node', reference.id);
            if (dump && Array.isArray(dump.__comps__)) {
                return { nodeUuid: reference.id, componentType: reference.type };
            }
        } catch {
            // Return the component lookup failure below.
        }
    }
    return { error: `inspector_set_instance_properties: could not resolve component reference ${reference.id}. Pass reference.id as a component UUID with reference.type as the component cid/type, or use cc.Node for node properties.` };
}

async function findComponentInScene(componentUuid: string): Promise<{ nodeUuid: string; componentType: string } | null> {
    try {
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const queue: any[] = Array.isArray(tree) ? [...tree] : [tree];
        while (queue.length > 0) {
            const item = queue.shift();
            const nodeUuid = item?.uuid?.value ?? item?.uuid;
            if (!nodeUuid) continue;
            try {
                const dump: any = await Editor.Message.request('scene', 'query-node', nodeUuid);
                const comps: any[] = Array.isArray(dump?.__comps__) ? dump.__comps__ : [];
                for (const comp of comps) {
                    const uuid = comp?.value?.uuid?.value ?? comp?.uuid?.value ?? comp?.uuid;
                    if (uuid === componentUuid) {
                        return {
                            nodeUuid,
                            componentType: String(comp?.__type__ ?? comp?.cid ?? comp?.type ?? 'cc.Component'),
                        };
                    }
                }
            } catch {
                // Keep scanning other nodes.
            }
            if (Array.isArray(item?.children)) queue.push(...item.children);
        }
    } catch {
        return null;
    }
    return null;
}

function normalizeDelegatedBatchResponse(
    resp: ToolResponse,
    kind: 'node' | 'component' | 'asset',
    requested: Array<{ path: string; type: string; value: any }>,
): ToolResponse {
    const rawResults = Array.isArray(resp.data?.results) ? resp.data.results : null;
    const results = rawResults
        ? rawResults.map((r: any, i: number) => ({
            path: r.path ?? r.property ?? r.propertyPath ?? requested[i]?.path,
            success: !!r.success,
            error: r.success ? undefined : (r.error ?? 'unknown'),
            warning: r.warning,
        }))
        : requested.map(p => ({
            path: p.path,
            success: !!resp.success,
            error: resp.success ? undefined : (resp.error ?? resp.message ?? 'unknown'),
        }));
    const failedCount = results.filter((r: any) => !r.success).length;
    const response: ToolResponse = {
        success: results.some((r: any) => r.success),
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
    if (resp.warning) response.warning = resp.warning;
    if (!response.success) response.error = resp.error ?? resp.message ?? response.message;
    return response;
}

interface RenderContext {
    definitions: string[];
    definedNames: Set<string>;
}

interface ResolvedPropertyType {
    tsType: string;
    decoratorType?: string;
}

function processTsClass(ctx: RenderContext, className: string, dump: any, isComponent: boolean): void {
    const safeClassName = sanitizeTsName(String(className ?? '').replace(/^cc\./, ''));
    if (ctx.definedNames.has(safeClassName)) return;
    ctx.definedNames.add(safeClassName);

    const lines: string[] = [];
    lines.push(`class ${safeClassName}${isComponent ? ' extends Component' : ''} {`);

    if (dump && typeof dump === 'object') {
        for (const propName of Object.keys(dump)) {
            if (NODE_DUMP_INTERNAL_KEYS.has(propName)) continue;
            const propEntry = dump[propName];
            if (propEntry === undefined || propEntry === null) continue;
            // Cocos dump entries are typically `{type, value, visible?, readonly?, ...}`.
            // Skip explicitly-hidden inspector fields; they're not user-facing.
            if (typeof propEntry === 'object' && propEntry.visible === false) continue;

            const resolved = resolveTsPropertyType(ctx, safeClassName, propName, propEntry);
            const readonly = propEntry?.readonly ? 'readonly ' : '';
            const tooltipSrc: string | undefined = propEntry?.tooltip;
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

    if (!isComponent && Array.isArray(dump?.__comps__) && dump.__comps__.length > 0) {
        lines.push('');
        lines.push('    // Components on this node (inspect each separately via get_instance_definition with the host node UUID first):');
        for (const comp of dump.__comps__) {
            const cType = sanitizeForComment(String(comp?.__type__ ?? comp?.type ?? 'unknown'));
            const cUuid = sanitizeForComment(String(comp?.value?.uuid?.value ?? comp?.uuid?.value ?? comp?.uuid ?? '?'));
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
function sanitizeForComment(text: string): string {
    return text
        .replace(/\*\//g, '*\\/')
        .replace(/\r?\n/g, ' ')
        .replace(/\r/g, ' ');
}

// v2.4.1 review fix (claude): unsanitized custom-script class names
// (e.g. `My.Foo`, `My-Foo`) emitted directly into the TS output produce
// invalid TS. JSON-stringify any property name that isn't a plain ident.
function isSafeTsIdentifier(name: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function resolveTsPropertyType(ctx: RenderContext, ownerClassName: string, propName: string, entry: any): ResolvedPropertyType {
    const isArray = !!entry?.isArray;
    const itemEntry = isArray ? arrayItemEntry(entry) : entry;
    const enumList = enumOrBitmaskList(itemEntry) ?? enumOrBitmaskList(entry);
    if (enumList) {
        const enumName = pascalCaseName(propName);
        generateConstEnumDefinition(ctx, enumName, enumList);
        return {
            tsType: isArray ? `Array<${enumName}>` : enumName,
            decoratorType: isArray ? `[${enumName}]` : enumName,
        };
    }

    const structValue = nestedStructValue(itemEntry);
    if (structValue && !isCommonValueType(itemEntry?.type) && !isReferenceEntry(itemEntry)) {
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

function resolveTsType(entry: any): string {
    if (entry === undefined || entry === null) return 'unknown';
    // Plain primitives passed through directly (rare in dump shape).
    const tt = typeof entry;
    if (tt === 'string') return 'string';
    if (tt === 'number') return 'number';
    if (tt === 'boolean') return 'boolean';

    const rawType: string = entry.type ?? entry.__type__ ?? '';

    let ts: string;
    switch (rawType) {
        case 'String': ts = 'string'; break;
        case 'Boolean': ts = 'boolean'; break;
        case 'Integer':
        case 'Float':
        case 'Number': ts = 'number'; break;
        case 'Enum':
        case 'BitMask': ts = 'number'; break;
        case 'cc.Vec2': ts = 'Vec2'; break;
        case 'cc.Vec3': ts = 'Vec3'; break;
        case 'cc.Vec4': ts = 'Vec4'; break;
        case 'cc.Color': ts = 'Color'; break;
        case 'cc.Rect': ts = 'Rect'; break;
        case 'cc.Size': ts = 'Size'; break;
        case 'cc.Quat': ts = 'Quat'; break;
        case 'cc.Mat3': ts = 'Mat3'; break;
        case 'cc.Mat4': ts = 'Mat4'; break;
        case '': ts = 'unknown'; break;
        default: {
            // v2.4.1 review fix (claude): sanitize custom class names
            // before pasting them into the TS output. `My.Foo` etc.
            // would be invalid TS otherwise.
            const strippedType = sanitizeTsName(rawType.replace(/^cc\./, '')) || 'unknown';
            const extendsList: string[] = Array.isArray(entry.extends) ? entry.extends : [];
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

function renderPropertyDecorator(entry: any, resolvedType?: string): string | null {
    if (!entry || typeof entry !== 'object') return null;

    const parts: string[] = [];
    const typeExpr = resolvedType ?? decoratorTypeExpression(entry);
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

    if (parts.length === 0) return null;
    return `@property({ ${parts.join(', ')} })`;
}

function decoratorTypeExpression(entry: any): string | null {
    const isArray = !!entry?.isArray;
    const itemEntry = isArray ? arrayItemEntry(entry) : entry;
    const rawType: string | undefined = itemEntry?.type;
    if (!rawType) return null;

    let expr: string | null;
    switch (rawType) {
        case 'Integer': expr = 'CCInteger'; break;
        case 'Float':
        case 'Number': expr = 'CCFloat'; break;
        case 'String': expr = 'String'; break;
        case 'Boolean': expr = 'Boolean'; break;
        case 'Enum':
        case 'BitMask': expr = 'Number'; break;
        default: expr = sanitizeTsName(rawType.replace(/^cc\./, ''));
    }
    if (!expr) return null;
    return isArray ? `[${expr}]` : expr;
}

function decoratorValue(value: any): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

function resolveI18nText(value: any): any {
    if (typeof value !== 'string' || !value.startsWith('i18n:')) return value;
    try {
        const translated = Editor.I18n.t(value.slice(5));
        if (typeof translated === 'string' && translated.trim().length > 0) {
            return translated;
        }
    } catch {
        // Keep original i18n key when editor localization is unavailable.
    }
    return value;
}

function arrayItemEntry(entry: any): any {
    if (entry?.elementTypeData) return entry.elementTypeData;
    if (Array.isArray(entry?.value) && entry.value.length > 0) return entry.value[0];
    return entry;
}

function enumOrBitmaskList(entry: any): any[] | null {
    if (!entry || typeof entry !== 'object') return null;
    return Array.isArray(entry.enumList) ? entry.enumList
        : Array.isArray(entry.bitmaskList) ? entry.bitmaskList
        : Array.isArray(entry?.userData?.enumList) ? entry.userData.enumList
        : Array.isArray(entry?.userData?.bitmaskList) ? entry.userData.bitmaskList
        : null;
}

function generateConstEnumDefinition(ctx: RenderContext, enumName: string, items: any[]): void {
    const safeEnumName = sanitizeTsName(enumName);
    if (ctx.definedNames.has(safeEnumName)) return;
    ctx.definedNames.add(safeEnumName);

    const usedMemberNames = new Set<string>();
    const lines: string[] = [`const enum ${safeEnumName} {`];
    items.forEach((item, index) => {
        const rawName = item?.name ?? item?.displayName ?? item?.value ?? `Value${index}`;
        let memberName = sanitizeTsName(String(rawName));
        if (usedMemberNames.has(memberName)) {
            memberName = `${memberName}_${index}`;
        }
        usedMemberNames.add(memberName);
        const value = item?.value;
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

function nestedStructValue(entry: any): any | null {
    if (!entry || typeof entry !== 'object') return null;
    const value = entry.value;
    if (value && typeof value === 'object' && !Array.isArray(value) && '__type__' in value) {
        return value;
    }
    if ('__type__' in entry && !('type' in entry)) {
        return entry;
    }
    return null;
}

function nestedStructClassName(ownerClassName: string, propName: string, value: any, isArray: boolean): string {
    const typeName = sanitizeTsName(String(value?.__type__ ?? '').replace(/^cc\./, ''));
    if (typeName && typeName !== '_Unknown' && typeName !== 'Object') {
        return typeName;
    }
    return sanitizeTsName(`${ownerClassName}${pascalCaseName(propName)}${isArray ? 'Item' : 'Type'}`);
}

function isCommonValueType(type: string | undefined): boolean {
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

function isReferenceEntry(entry: any): boolean {
    if (!entry || typeof entry !== 'object') return false;
    const rawType: string = entry.type ?? entry.__type__ ?? '';
    const extendsList: string[] = Array.isArray(entry.extends) ? entry.extends : [];
    return extendsList.includes('cc.Object')
        || rawType === 'Node'
        || rawType === 'Component'
        || rawType === 'cc.Node'
        || rawType === 'cc.Component'
        || (rawType.startsWith('cc.') && !isCommonValueType(rawType));
}

function pascalCaseName(name: string): string {
    const words = String(name ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
    return sanitizeTsName(pascal || name || 'Value');
}

function isComponentDump(dump: any): boolean {
    if (!dump || typeof dump !== 'object') return false;
    const rawType = String(dump.__type__ ?? dump.type ?? '');
    if (rawType === 'Node' || rawType === 'cc.Node') return false;
    const extendsList: string[] = Array.isArray(dump.extends) ? dump.extends : [];
    return extendsList.includes('cc.Component') || !Array.isArray(dump.__comps__);
}

// v2.4.2 review fix (codex): the v2.4.1 implementation only stripped
// non-identifier characters but didn't guard against a digit-leading
// result (`class 2dSprite`) or an empty result (after stripping all
// chars in a UUID-shaped __type__). Both produce invalid TS. Prefix
// digit-leading and empty cases with `_` / `_Unknown`.
function sanitizeTsName(name: string): string {
    const cleaned = String(name ?? '').replace(/[^a-zA-Z0-9_]/g, '_');
    if (cleaned.length === 0) return '_Unknown';
    if (/^[0-9]/.test(cleaned)) return `_${cleaned}`;
    return cleaned;
}
