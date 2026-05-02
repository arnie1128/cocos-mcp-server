export const BUILTIN_2D_COMPONENTS: ReadonlySet<string> = new Set([
    'cc.Sprite',
    'cc.Label',
    'cc.Button',
    'cc.Layout',
    'cc.Widget',
    'cc.UITransform',
    'cc.RichText',
    'cc.EditBox',
    'cc.Toggle',
    'cc.ScrollView',
    'cc.PageView',
    'cc.Slider',
    'cc.ProgressBar',
    'cc.Mask',
    'cc.Graphics'
]);

export const BUILTIN_3D_COMPONENTS: ReadonlySet<string> = new Set([
    'cc.MeshRenderer',
    'cc.SkinnedMeshRenderer',
    'cc.Light',
    'cc.DirectionalLight',
    'cc.SpotLight',
    'cc.PointLight',
    'cc.Camera'
]);

// Strict membership only. v2.10.4 fix: previous fallback used
// `type.includes(comp)` which would falsely match e.g. `cc.SpriteFrame`
// against `cc.Sprite`. Cocos cc.* types are namespaced cleanly, so
// exact Set lookup is sufficient and correct.
export function is2DComponentType(type: string): boolean {
    return !!type && BUILTIN_2D_COMPONENTS.has(type);
}

export function is3DComponentType(type: string): boolean {
    return !!type && BUILTIN_3D_COMPONENTS.has(type);
}
