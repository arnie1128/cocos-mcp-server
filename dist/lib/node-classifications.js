"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_3D_COMPONENTS = exports.BUILTIN_2D_COMPONENTS = void 0;
exports.is2DComponentType = is2DComponentType;
exports.is3DComponentType = is3DComponentType;
exports.BUILTIN_2D_COMPONENTS = new Set([
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
exports.BUILTIN_3D_COMPONENTS = new Set([
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
function is2DComponentType(type) {
    return !!type && exports.BUILTIN_2D_COMPONENTS.has(type);
}
function is3DComponentType(type) {
    return !!type && exports.BUILTIN_3D_COMPONENTS.has(type);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1jbGFzc2lmaWNhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL25vZGUtY2xhc3NpZmljYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQWdDQSw4Q0FFQztBQUVELDhDQUVDO0FBdENZLFFBQUEscUJBQXFCLEdBQXdCLElBQUksR0FBRyxDQUFDO0lBQzlELFdBQVc7SUFDWCxVQUFVO0lBQ1YsV0FBVztJQUNYLFdBQVc7SUFDWCxXQUFXO0lBQ1gsZ0JBQWdCO0lBQ2hCLGFBQWE7SUFDYixZQUFZO0lBQ1osV0FBVztJQUNYLGVBQWU7SUFDZixhQUFhO0lBQ2IsV0FBVztJQUNYLGdCQUFnQjtJQUNoQixTQUFTO0lBQ1QsYUFBYTtDQUNoQixDQUFDLENBQUM7QUFFVSxRQUFBLHFCQUFxQixHQUF3QixJQUFJLEdBQUcsQ0FBQztJQUM5RCxpQkFBaUI7SUFDakIsd0JBQXdCO0lBQ3hCLFVBQVU7SUFDVixxQkFBcUI7SUFDckIsY0FBYztJQUNkLGVBQWU7SUFDZixXQUFXO0NBQ2QsQ0FBQyxDQUFDO0FBRUgsOERBQThEO0FBQzlELHdFQUF3RTtBQUN4RSxtRUFBbUU7QUFDbkUsOENBQThDO0FBQzlDLFNBQWdCLGlCQUFpQixDQUFDLElBQVk7SUFDMUMsT0FBTyxDQUFDLENBQUMsSUFBSSxJQUFJLDZCQUFxQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBRUQsU0FBZ0IsaUJBQWlCLENBQUMsSUFBWTtJQUMxQyxPQUFPLENBQUMsQ0FBQyxJQUFJLElBQUksNkJBQXFCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgQlVJTFRJTl8yRF9DT01QT05FTlRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXHJcbiAgICAnY2MuU3ByaXRlJyxcclxuICAgICdjYy5MYWJlbCcsXHJcbiAgICAnY2MuQnV0dG9uJyxcclxuICAgICdjYy5MYXlvdXQnLFxyXG4gICAgJ2NjLldpZGdldCcsXHJcbiAgICAnY2MuVUlUcmFuc2Zvcm0nLFxyXG4gICAgJ2NjLlJpY2hUZXh0JyxcclxuICAgICdjYy5FZGl0Qm94JyxcclxuICAgICdjYy5Ub2dnbGUnLFxyXG4gICAgJ2NjLlNjcm9sbFZpZXcnLFxyXG4gICAgJ2NjLlBhZ2VWaWV3JyxcclxuICAgICdjYy5TbGlkZXInLFxyXG4gICAgJ2NjLlByb2dyZXNzQmFyJyxcclxuICAgICdjYy5NYXNrJyxcclxuICAgICdjYy5HcmFwaGljcydcclxuXSk7XHJcblxyXG5leHBvcnQgY29uc3QgQlVJTFRJTl8zRF9DT01QT05FTlRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXHJcbiAgICAnY2MuTWVzaFJlbmRlcmVyJyxcclxuICAgICdjYy5Ta2lubmVkTWVzaFJlbmRlcmVyJyxcclxuICAgICdjYy5MaWdodCcsXHJcbiAgICAnY2MuRGlyZWN0aW9uYWxMaWdodCcsXHJcbiAgICAnY2MuU3BvdExpZ2h0JyxcclxuICAgICdjYy5Qb2ludExpZ2h0JyxcclxuICAgICdjYy5DYW1lcmEnXHJcbl0pO1xyXG5cclxuLy8gU3RyaWN0IG1lbWJlcnNoaXAgb25seS4gdjIuMTAuNCBmaXg6IHByZXZpb3VzIGZhbGxiYWNrIHVzZWRcclxuLy8gYHR5cGUuaW5jbHVkZXMoY29tcClgIHdoaWNoIHdvdWxkIGZhbHNlbHkgbWF0Y2ggZS5nLiBgY2MuU3ByaXRlRnJhbWVgXHJcbi8vIGFnYWluc3QgYGNjLlNwcml0ZWAuIENvY29zIGNjLiogdHlwZXMgYXJlIG5hbWVzcGFjZWQgY2xlYW5seSwgc29cclxuLy8gZXhhY3QgU2V0IGxvb2t1cCBpcyBzdWZmaWNpZW50IGFuZCBjb3JyZWN0LlxyXG5leHBvcnQgZnVuY3Rpb24gaXMyRENvbXBvbmVudFR5cGUodHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gISF0eXBlICYmIEJVSUxUSU5fMkRfQ09NUE9ORU5UUy5oYXModHlwZSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpczNEQ29tcG9uZW50VHlwZSh0eXBlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAhIXR5cGUgJiYgQlVJTFRJTl8zRF9DT01QT05FTlRTLmhhcyh0eXBlKTtcclxufVxyXG4iXX0=