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

import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { instanceReferenceSchema, InstanceReference } from '../lib/instance-reference';

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

export class InspectorTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'get_common_types_definition',
        description: 'Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query.',
        inputSchema: z.object({}),
    })
    async getCommonTypesDefinition(): Promise<ToolResponse> {
        return {
            success: true,
            data: { definition: COMMON_TYPES_DEFINITION },
        };
    }

    @mcpTool({
        name: 'get_instance_definition',
        description: 'Generate a TypeScript class declaration for a scene node or component, derived from the live cocos query-node dump. AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. Returns plain TS source as a string.',
        inputSchema: z.object({
            reference: instanceReferenceSchema.describe('Target node or component. {id} = UUID, {type} optional cc class label.'),
        }),
    })
    async getInstanceDefinition(args: { reference: InstanceReference }): Promise<ToolResponse> {
        const { reference } = args;
        if (!reference?.id) {
            return { success: false, error: 'inspector_get_instance_definition: reference.id is required' };
        }
        try {
            const dump: any = await Editor.Message.request('scene', 'query-node', reference.id);
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
                    reference: { id: reference.id, type: dump.__type__ ?? reference.type },
                    definition: ts,
                },
            };
        } catch (err: any) {
            return { success: false, error: `inspector: query-node failed: ${err?.message ?? String(err)}` };
        }
    }
}

function looksLikeComponent(dump: any): boolean {
    const t = (dump?.__type__ ?? dump?.type ?? '') as string;
    if (typeof t !== 'string') return false;
    return t.startsWith('cc.') && t !== 'cc.Node' && t !== 'cc.Scene';
}

/**
 * Render a single class declaration. For nodes, also enumerate
 * components from `__comps__` as a comment so AI knows which
 * sub-instances exist (without inlining their full TS — those
 * require a separate get_instance_definition call by component
 * UUID).
 */
function renderTsClass(className: string, dump: any, isComponent: boolean): string {
    const lines: string[] = [];
    lines.push(`class ${sanitizeTsName(className)} {`);

    const internalKeys = isComponent ? COMPONENT_INTERNAL_KEYS : NODE_DUMP_INTERNAL_KEYS;
    for (const propName of Object.keys(dump)) {
        if (internalKeys.has(propName)) continue;
        const propEntry = dump[propName];
        if (propEntry === undefined || propEntry === null) continue;
        // Cocos dump entries are typically `{type, value, visible?, readonly?, ...}`.
        // Skip explicitly-hidden inspector fields; they're not user-facing.
        if (typeof propEntry === 'object' && propEntry.visible === false) continue;

        const tsType = resolveTsType(propEntry);
        const readonly = propEntry?.readonly ? 'readonly ' : '';
        const tooltipSrc: string | undefined = propEntry?.tooltip;
        if (tooltipSrc && typeof tooltipSrc === 'string') {
            lines.push(`    /** ${tooltipSrc.replace(/\*\//g, '*\\/')} */`);
        }
        lines.push(`    ${readonly}${propName}: ${tsType};`);
    }

    if (!isComponent && Array.isArray(dump.__comps__) && dump.__comps__.length > 0) {
        lines.push('');
        lines.push('    // Components on this node (read each via get_instance_definition with the component uuid):');
        for (const comp of dump.__comps__) {
            const cType = comp?.__type__ ?? comp?.type ?? 'unknown';
            const cUuid = comp?.value?.uuid?.value ?? comp?.uuid?.value ?? comp?.uuid ?? '?';
            lines.push(`    // - ${cType}  uuid=${cUuid}`);
        }
    }

    lines.push('}');
    return lines.join('\n');
}

function resolveTsType(entry: any): string {
    if (entry === undefined || entry === null) return 'unknown';
    // Plain primitives passed through directly (rare in dump shape).
    const tt = typeof entry;
    if (tt === 'string') return 'string';
    if (tt === 'number') return 'number';
    if (tt === 'boolean') return 'boolean';

    const rawType: string = entry.type ?? entry.__type__ ?? '';
    const isArray = !!entry.isArray;

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
            const strippedType = rawType.replace(/^cc\./, '');
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
    return isArray ? `Array<${ts}>` : ts;
}

function sanitizeTsName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
