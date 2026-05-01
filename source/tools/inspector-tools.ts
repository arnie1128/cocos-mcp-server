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
        description: 'Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. v2.4.1 note: only node-shaped references are inspected here — component/asset definition support is deferred until a verified Cocos query-component channel is wired.',
        inputSchema: z.object({
            reference: instanceReferenceSchema.describe('Target node. {id} = node UUID, {type} optional cc class label. Component or asset references will return an error in v2.4.1.'),
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
                return { success: false, error: `inspector: query-node returned no dump for ${reference.id}. If this is a component or asset UUID, v2.4.1 does not support it; pass the host node UUID instead.` };
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
            const ts = renderTsClass(className, dump, /* isComponent */ false);
            const response: ToolResponse = {
                success: true,
                data: {
                    reference: { id: reference.id, type: dump.__type__ ?? reference.type },
                    definition: ts,
                },
            };
            if (referenceTypeMismatch) {
                response.warning = `inspector: reference.type (${reference.type}) does not match dump __type__ (${dumpType}); class label uses the dump value`;
            }
            return response;
        } catch (err: any) {
            return { success: false, error: `inspector: query-node failed: ${err?.message ?? String(err)}` };
        }
    }
}

/**
 * Render a single class declaration. For nodes, also enumerate
 * components from `__comps__` as a comment so AI knows which
 * sub-instances exist (without inlining their full TS — those
 * require a separate get_instance_definition call by component
 * UUID).
 */
function renderTsClass(className: string, dump: any, _isComponent: boolean): string {
    // v2.4.2: _isComponent kept for forward-compat signature stability;
    // currently always false. v2.5+ will reintroduce a component branch.
    const lines: string[] = [];
    lines.push(`class ${sanitizeTsName(className)} {`);

    for (const propName of Object.keys(dump)) {
        if (NODE_DUMP_INTERNAL_KEYS.has(propName)) continue;
        const propEntry = dump[propName];
        if (propEntry === undefined || propEntry === null) continue;
        // Cocos dump entries are typically `{type, value, visible?, readonly?, ...}`.
        // Skip explicitly-hidden inspector fields; they're not user-facing.
        if (typeof propEntry === 'object' && propEntry.visible === false) continue;

        const tsType = resolveTsType(propEntry);
        const readonly = propEntry?.readonly ? 'readonly ' : '';
        const enumHint = enumCommentHint(propEntry);
        const tooltipSrc: string | undefined = propEntry?.tooltip;
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
            const cType = sanitizeForComment(String(comp?.__type__ ?? comp?.type ?? 'unknown'));
            const cUuid = sanitizeForComment(String(comp?.value?.uuid?.value ?? comp?.uuid?.value ?? comp?.uuid ?? '?'));
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

// v2.4.1 review fix (gemini): Enum/BitMask were emitted as bare
// `number`. Surface the enum class via comment so AI can look it up
// rather than guess.
function enumCommentHint(entry: any): string | null {
    if (!entry || typeof entry !== 'object') return null;
    const t: string = entry.type ?? '';
    if (t !== 'Enum' && t !== 'BitMask') return null;
    // v2.4.2 review fix (claude): the v2.4.1 fallback included
    // `userData.enumList[0].name` which is the *first enum value's*
    // name, not the enum class name — produced misleading comments.
    // Drop that path; only use explicit enumName fields.
    const enumName: string | undefined = entry?.userData?.enumName
        ?? entry?.enumName;
    // v2.4.2 review fix (codex): cocos sometimes nests enumList /
    // bitmaskList under userData, sometimes at the top level. Check
    // both before giving up.
    const list = Array.isArray(entry.enumList) ? entry.enumList
        : Array.isArray(entry.bitmaskList) ? entry.bitmaskList
        : Array.isArray(entry?.userData?.enumList) ? entry.userData.enumList
        : Array.isArray(entry?.userData?.bitmaskList) ? entry.userData.bitmaskList
        : null;
    const sample = list && list.length > 0
        ? list.slice(0, 8).map((it: any) => {
            const n = it?.name ?? '?';
            const v = it?.value ?? '?';
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
    return isArray ? `Array<${ts}>` : ts;
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
