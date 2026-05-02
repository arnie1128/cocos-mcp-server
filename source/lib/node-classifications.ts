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

export function is2DComponentType(type: string): boolean {
    if (!type) return false;
    if (BUILTIN_2D_COMPONENTS.has(type)) return true;
    for (const comp of BUILTIN_2D_COMPONENTS) {
        if (type.includes(comp)) return true;
    }
    return false;
}

export function is3DComponentType(type: string): boolean {
    if (!type) return false;
    if (BUILTIN_3D_COMPONENTS.has(type)) return true;
    for (const comp of BUILTIN_3D_COMPONENTS) {
        if (type.includes(comp)) return true;
    }
    return false;
}
