"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceImageTools = void 0;
const schema_1 = require("../lib/schema");
const referenceImageSchemas = {
    add_reference_image: schema_1.z.object({
        paths: schema_1.z.array(schema_1.z.string()).describe('Absolute image file paths to add as scene reference images.'),
    }),
    remove_reference_image: schema_1.z.object({
        paths: schema_1.z.array(schema_1.z.string()).optional().describe('Reference image paths to remove. Omit/empty removes the current image.'),
    }),
    switch_reference_image: schema_1.z.object({
        path: schema_1.z.string().describe('Absolute reference image path to make current.'),
        sceneUUID: schema_1.z.string().optional().describe('Optional scene UUID scope for the switch.'),
    }),
    set_reference_image_data: schema_1.z.object({
        key: schema_1.z.enum(['path', 'x', 'y', 'sx', 'sy', 'opacity']).describe('Reference image property key to set.'),
        value: schema_1.z.any().describe('Property value: path string, x/y/sx/sy number, or opacity 0-1.'),
    }),
    query_reference_image_config: schema_1.z.object({}),
    query_current_reference_image: schema_1.z.object({}),
    refresh_reference_image: schema_1.z.object({}),
    set_reference_image_position: schema_1.z.object({
        x: schema_1.z.number().describe('Reference image X offset.'),
        y: schema_1.z.number().describe('Reference image Y offset.'),
    }),
    set_reference_image_scale: schema_1.z.object({
        sx: schema_1.z.number().min(0.1).max(10).describe('Reference image X scale, 0.1-10.'),
        sy: schema_1.z.number().min(0.1).max(10).describe('Reference image Y scale, 0.1-10.'),
    }),
    set_reference_image_opacity: schema_1.z.object({
        opacity: schema_1.z.number().min(0).max(1).describe('Reference image opacity from 0.0 to 1.0.'),
    }),
    list_reference_images: schema_1.z.object({}),
    clear_all_reference_images: schema_1.z.object({}),
};
const referenceImageToolMeta = {
    add_reference_image: 'Add absolute image paths to the reference-image module; does not create assets.',
    remove_reference_image: 'Remove specific reference images, or current image when paths are omitted.',
    switch_reference_image: 'Switch active reference image by absolute path, optionally scoped to scene UUID.',
    set_reference_image_data: 'Set one raw reference-image display property: path/x/y/sx/sy/opacity.',
    query_reference_image_config: 'Read reference-image module configuration.',
    query_current_reference_image: 'Read current reference-image state.',
    refresh_reference_image: 'Refresh reference-image display without changing image data.',
    set_reference_image_position: 'Set current reference image x/y offsets.',
    set_reference_image_scale: 'Set current reference image x/y scale.',
    set_reference_image_opacity: 'Set current reference image opacity.',
    list_reference_images: 'Read reference-image config plus current image data.',
    clear_all_reference_images: 'Remove reference images from the module; does not delete files/assets.',
};
class ReferenceImageTools {
    getTools() {
        return Object.keys(referenceImageSchemas).map(name => ({
            name,
            description: referenceImageToolMeta[name],
            inputSchema: (0, schema_1.toInputSchema)(referenceImageSchemas[name]),
        }));
    }
    async execute(toolName, args) {
        const schemaName = toolName;
        const schema = referenceImageSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = (0, schema_1.validateArgs)(schema, args !== null && args !== void 0 ? args : {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data;
        switch (schemaName) {
            case 'add_reference_image':
                return await this.addReferenceImage(a.paths);
            case 'remove_reference_image':
                return await this.removeReferenceImage(a.paths);
            case 'switch_reference_image':
                return await this.switchReferenceImage(a.path, a.sceneUUID);
            case 'set_reference_image_data':
                return await this.setReferenceImageData(a.key, a.value);
            case 'query_reference_image_config':
                return await this.queryReferenceImageConfig();
            case 'query_current_reference_image':
                return await this.queryCurrentReferenceImage();
            case 'refresh_reference_image':
                return await this.refreshReferenceImage();
            case 'set_reference_image_position':
                return await this.setReferenceImagePosition(a.x, a.y);
            case 'set_reference_image_scale':
                return await this.setReferenceImageScale(a.sx, a.sy);
            case 'set_reference_image_opacity':
                return await this.setReferenceImageOpacity(a.opacity);
            case 'list_reference_images':
                return await this.listReferenceImages();
            case 'clear_all_reference_images':
                return await this.clearAllReferenceImages();
        }
    }
    async addReferenceImage(paths) {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'add-image', paths).then(() => {
                resolve({
                    success: true,
                    data: {
                        addedPaths: paths,
                        count: paths.length,
                        message: `Added ${paths.length} reference image(s)`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async removeReferenceImage(paths) {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'remove-image', paths).then(() => {
                const message = paths && paths.length > 0 ?
                    `Removed ${paths.length} reference image(s)` :
                    'Removed current reference image';
                resolve({
                    success: true,
                    message: message
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async switchReferenceImage(path, sceneUUID) {
        return new Promise((resolve) => {
            const args = sceneUUID ? [path, sceneUUID] : [path];
            Editor.Message.request('reference-image', 'switch-image', ...args).then(() => {
                resolve({
                    success: true,
                    data: {
                        path: path,
                        sceneUUID: sceneUUID,
                        message: `Switched to reference image: ${path}`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async setReferenceImageData(key, value) {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'set-image-data', key, value).then(() => {
                resolve({
                    success: true,
                    data: {
                        key: key,
                        value: value,
                        message: `Reference image ${key} set to ${value}`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async queryReferenceImageConfig() {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'query-config').then((config) => {
                resolve({
                    success: true,
                    data: config
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async queryCurrentReferenceImage() {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'query-current').then((current) => {
                resolve({
                    success: true,
                    data: current
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async refreshReferenceImage() {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'refresh').then(() => {
                resolve({
                    success: true,
                    message: 'Reference image refreshed'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async setReferenceImagePosition(x, y) {
        return new Promise(async (resolve) => {
            try {
                await Editor.Message.request('reference-image', 'set-image-data', 'x', x);
                await Editor.Message.request('reference-image', 'set-image-data', 'y', y);
                resolve({
                    success: true,
                    data: {
                        x: x,
                        y: y,
                        message: `Reference image position set to (${x}, ${y})`
                    }
                });
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
    async setReferenceImageScale(sx, sy) {
        return new Promise(async (resolve) => {
            try {
                await Editor.Message.request('reference-image', 'set-image-data', 'sx', sx);
                await Editor.Message.request('reference-image', 'set-image-data', 'sy', sy);
                resolve({
                    success: true,
                    data: {
                        sx: sx,
                        sy: sy,
                        message: `Reference image scale set to (${sx}, ${sy})`
                    }
                });
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
    async setReferenceImageOpacity(opacity) {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'set-image-data', 'opacity', opacity).then(() => {
                resolve({
                    success: true,
                    data: {
                        opacity: opacity,
                        message: `Reference image opacity set to ${opacity}`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async listReferenceImages() {
        return new Promise(async (resolve) => {
            try {
                const config = await Editor.Message.request('reference-image', 'query-config');
                const current = await Editor.Message.request('reference-image', 'query-current');
                resolve({
                    success: true,
                    data: {
                        config: config,
                        current: current,
                        message: 'Reference image information retrieved'
                    }
                });
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
    async clearAllReferenceImages() {
        return new Promise(async (resolve) => {
            try {
                // Remove all reference images by calling remove-image without paths
                await Editor.Message.request('reference-image', 'remove-image');
                resolve({
                    success: true,
                    message: 'All reference images cleared'
                });
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
}
exports.ReferenceImageTools = ReferenceImageTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlLWltYWdlLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3JlZmVyZW5jZS1pbWFnZS10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQ0FBK0Q7QUFFL0QsTUFBTSxxQkFBcUIsR0FBRztJQUMxQixtQkFBbUIsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQzFCLEtBQUssRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw2REFBNkQsQ0FBQztLQUNyRyxDQUFDO0lBQ0Ysc0JBQXNCLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUM3QixLQUFLLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsd0VBQXdFLENBQUM7S0FDM0gsQ0FBQztJQUNGLHNCQUFzQixFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDN0IsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0RBQWdELENBQUM7UUFDM0UsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLENBQUM7S0FDekYsQ0FBQztJQUNGLHdCQUF3QixFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDL0IsR0FBRyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxDQUFDO1FBQ3ZHLEtBQUssRUFBRSxVQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLGdFQUFnRSxDQUFDO0tBQzVGLENB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QUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQXZQRCxrREF1UEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6LCB0b0lucHV0U2NoZW1hLCB2YWxpZGF0ZUFyZ3MgfSBmcm9tICcuLi9saWIvc2NoZW1hJztcblxuY29uc3QgcmVmZXJlbmNlSW1hZ2VTY2hlbWFzID0ge1xuICAgIGFkZF9yZWZlcmVuY2VfaW1hZ2U6IHoub2JqZWN0KHtcbiAgICAgICAgcGF0aHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ0Fic29sdXRlIGltYWdlIGZpbGUgcGF0aHMgdG8gYWRkIGFzIHNjZW5lIHJlZmVyZW5jZSBpbWFnZXMuJyksXG4gICAgfSksXG4gICAgcmVtb3ZlX3JlZmVyZW5jZV9pbWFnZTogei5vYmplY3Qoe1xuICAgICAgICBwYXRoczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSZWZlcmVuY2UgaW1hZ2UgcGF0aHMgdG8gcmVtb3ZlLiBPbWl0L2VtcHR5IHJlbW92ZXMgdGhlIGN1cnJlbnQgaW1hZ2UuJyksXG4gICAgfSksXG4gICAgc3dpdGNoX3JlZmVyZW5jZV9pbWFnZTogei5vYmplY3Qoe1xuICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSByZWZlcmVuY2UgaW1hZ2UgcGF0aCB0byBtYWtlIGN1cnJlbnQuJyksXG4gICAgICAgIHNjZW5lVVVJRDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzY2VuZSBVVUlEIHNjb3BlIGZvciB0aGUgc3dpdGNoLicpLFxuICAgIH0pLFxuICAgIHNldF9yZWZlcmVuY2VfaW1hZ2VfZGF0YTogei5vYmplY3Qoe1xuICAgICAgICBrZXk6IHouZW51bShbJ3BhdGgnLCAneCcsICd5JywgJ3N4JywgJ3N5JywgJ29wYWNpdHknXSkuZGVzY3JpYmUoJ1JlZmVyZW5jZSBpbWFnZSBwcm9wZXJ0eSBrZXkgdG8gc2V0LicpLFxuICAgICAgICB2YWx1ZTogei5hbnkoKS5kZXNjcmliZSgnUHJvcGVydHkgdmFsdWU6IHBhdGggc3RyaW5nLCB4L3kvc3gvc3kgbnVtYmVyLCBvciBvcGFjaXR5IDAtMS4nKSxcbiAgICB9KSxcbiAgICBxdWVyeV9yZWZlcmVuY2VfaW1hZ2VfY29uZmlnOiB6Lm9iamVjdCh7fSksXG4gICAgcXVlcnlfY3VycmVudF9yZWZlcmVuY2VfaW1hZ2U6IHoub2JqZWN0KHt9KSxcbiAgICByZWZyZXNoX3JlZmVyZW5jZV9pbWFnZTogei5vYmplY3Qoe30pLFxuICAgIHNldF9yZWZlcmVuY2VfaW1hZ2VfcG9zaXRpb246IHoub2JqZWN0KHtcbiAgICAgICAgeDogei5udW1iZXIoKS5kZXNjcmliZSgnUmVmZXJlbmNlIGltYWdlIFggb2Zmc2V0LicpLFxuICAgICAgICB5OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdSZWZlcmVuY2UgaW1hZ2UgWSBvZmZzZXQuJyksXG4gICAgfSksXG4gICAgc2V0X3JlZmVyZW5jZV9pbWFnZV9zY2FsZTogei5vYmplY3Qoe1xuICAgICAgICBzeDogei5udW1iZXIoKS5taW4oMC4xKS5tYXgoMTApLmRlc2NyaWJlKCdSZWZlcmVuY2UgaW1hZ2UgWCBzY2FsZSwgMC4xLTEwLicpLFxuICAgICAgICBzeTogei5udW1iZXIoKS5taW4oMC4xKS5tYXgoMTApLmRlc2NyaWJlKCdSZWZlcmVuY2UgaW1hZ2UgWSBzY2FsZSwgMC4xLTEwLicpLFxuICAgIH0pLFxuICAgIHNldF9yZWZlcmVuY2VfaW1hZ2Vfb3BhY2l0eTogei5vYmplY3Qoe1xuICAgICAgICBvcGFjaXR5OiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMSkuZGVzY3JpYmUoJ1JlZmVyZW5jZSBpbWFnZSBvcGFjaXR5IGZyb20gMC4wIHRvIDEuMC4nKSxcbiAgICB9KSxcbiAgICBsaXN0X3JlZmVyZW5jZV9pbWFnZXM6IHoub2JqZWN0KHt9KSxcbiAgICBjbGVhcl9hbGxfcmVmZXJlbmNlX2ltYWdlczogei5vYmplY3Qoe30pLFxufSBhcyBjb25zdDtcblxuY29uc3QgcmVmZXJlbmNlSW1hZ2VUb29sTWV0YTogUmVjb3JkPGtleW9mIHR5cGVvZiByZWZlcmVuY2VJbWFnZVNjaGVtYXMsIHN0cmluZz4gPSB7XG4gICAgYWRkX3JlZmVyZW5jZV9pbWFnZTogJ0FkZCBhYnNvbHV0ZSBpbWFnZSBwYXRocyB0byB0aGUgcmVmZXJlbmNlLWltYWdlIG1vZHVsZTsgZG9lcyBub3QgY3JlYXRlIGFzc2V0cy4nLFxuICAgIHJlbW92ZV9yZWZlcmVuY2VfaW1hZ2U6ICdSZW1vdmUgc3BlY2lmaWMgcmVmZXJlbmNlIGltYWdlcywgb3IgY3VycmVudCBpbWFnZSB3aGVuIHBhdGhzIGFyZSBvbWl0dGVkLicsXG4gICAgc3dpdGNoX3JlZmVyZW5jZV9pbWFnZTogJ1N3aXRjaCBhY3RpdmUgcmVmZXJlbmNlIGltYWdlIGJ5IGFic29sdXRlIHBhdGgsIG9wdGlvbmFsbHkgc2NvcGVkIHRvIHNjZW5lIFVVSUQuJyxcbiAgICBzZXRfcmVmZXJlbmNlX2ltYWdlX2RhdGE6ICdTZXQgb25lIHJhdyByZWZlcmVuY2UtaW1hZ2UgZGlzcGxheSBwcm9wZXJ0eTogcGF0aC94L3kvc3gvc3kvb3BhY2l0eS4nLFxuICAgIHF1ZXJ5X3JlZmVyZW5jZV9pbWFnZV9jb25maWc6ICdSZWFkIHJlZmVyZW5jZS1pbWFnZSBtb2R1bGUgY29uZmlndXJhdGlvbi4nLFxuICAgIHF1ZXJ5X2N1cnJlbnRfcmVmZXJlbmNlX2ltYWdlOiAnUmVhZCBjdXJyZW50IHJlZmVyZW5jZS1pbWFnZSBzdGF0ZS4nLFxuICAgIHJlZnJlc2hfcmVmZXJlbmNlX2ltYWdlOiAnUmVmcmVzaCByZWZlcmVuY2UtaW1hZ2UgZGlzcGxheSB3aXRob3V0IGNoYW5naW5nIGltYWdlIGRhdGEuJyxcbiAgICBzZXRfcmVmZXJlbmNlX2ltYWdlX3Bvc2l0aW9uOiAnU2V0IGN1cnJlbnQgcmVmZXJlbmNlIGltYWdlIHgveSBvZmZzZXRzLicsXG4gICAgc2V0X3JlZmVyZW5jZV9pbWFnZV9zY2FsZTogJ1NldCBjdXJyZW50IHJlZmVyZW5jZSBpbWFnZSB4L3kgc2NhbGUuJyxcbiAgICBzZXRfcmVmZXJlbmNlX2ltYWdlX29wYWNpdHk6ICdTZXQgY3VycmVudCByZWZlcmVuY2UgaW1hZ2Ugb3BhY2l0eS4nLFxuICAgIGxpc3RfcmVmZXJlbmNlX2ltYWdlczogJ1JlYWQgcmVmZXJlbmNlLWltYWdlIGNvbmZpZyBwbHVzIGN1cnJlbnQgaW1hZ2UgZGF0YS4nLFxuICAgIGNsZWFyX2FsbF9yZWZlcmVuY2VfaW1hZ2VzOiAnUmVtb3ZlIHJlZmVyZW5jZSBpbWFnZXMgZnJvbSB0aGUgbW9kdWxlOyBkb2VzIG5vdCBkZWxldGUgZmlsZXMvYXNzZXRzLicsXG59O1xuXG5leHBvcnQgY2xhc3MgUmVmZXJlbmNlSW1hZ2VUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiAoT2JqZWN0LmtleXMocmVmZXJlbmNlSW1hZ2VTY2hlbWFzKSBhcyBBcnJheTxrZXlvZiB0eXBlb2YgcmVmZXJlbmNlSW1hZ2VTY2hlbWFzPikubWFwKG5hbWUgPT4gKHtcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogcmVmZXJlbmNlSW1hZ2VUb29sTWV0YVtuYW1lXSxcbiAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0b0lucHV0U2NoZW1hKHJlZmVyZW5jZUltYWdlU2NoZW1hc1tuYW1lXSksXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjaGVtYU5hbWUgPSB0b29sTmFtZSBhcyBrZXlvZiB0eXBlb2YgcmVmZXJlbmNlSW1hZ2VTY2hlbWFzO1xuICAgICAgICBjb25zdCBzY2hlbWEgPSByZWZlcmVuY2VJbWFnZVNjaGVtYXNbc2NoZW1hTmFtZV07XG4gICAgICAgIGlmICghc2NoZW1hKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVBcmdzKHNjaGVtYSwgYXJncyA/PyB7fSk7XG4gICAgICAgIGlmICghdmFsaWRhdGlvbi5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRpb24ucmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYSA9IHZhbGlkYXRpb24uZGF0YSBhcyBhbnk7XG5cbiAgICAgICAgc3dpdGNoIChzY2hlbWFOYW1lKSB7XG4gICAgICAgICAgICBjYXNlICdhZGRfcmVmZXJlbmNlX2ltYWdlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5hZGRSZWZlcmVuY2VJbWFnZShhLnBhdGhzKTtcbiAgICAgICAgICAgIGNhc2UgJ3JlbW92ZV9yZWZlcmVuY2VfaW1hZ2UnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJlbW92ZVJlZmVyZW5jZUltYWdlKGEucGF0aHMpO1xuICAgICAgICAgICAgY2FzZSAnc3dpdGNoX3JlZmVyZW5jZV9pbWFnZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc3dpdGNoUmVmZXJlbmNlSW1hZ2UoYS5wYXRoLCBhLnNjZW5lVVVJRCk7XG4gICAgICAgICAgICBjYXNlICdzZXRfcmVmZXJlbmNlX2ltYWdlX2RhdGEnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJlZmVyZW5jZUltYWdlRGF0YShhLmtleSwgYS52YWx1ZSk7XG4gICAgICAgICAgICBjYXNlICdxdWVyeV9yZWZlcmVuY2VfaW1hZ2VfY29uZmlnJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeVJlZmVyZW5jZUltYWdlQ29uZmlnKCk7XG4gICAgICAgICAgICBjYXNlICdxdWVyeV9jdXJyZW50X3JlZmVyZW5jZV9pbWFnZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucXVlcnlDdXJyZW50UmVmZXJlbmNlSW1hZ2UoKTtcbiAgICAgICAgICAgIGNhc2UgJ3JlZnJlc2hfcmVmZXJlbmNlX2ltYWdlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5yZWZyZXNoUmVmZXJlbmNlSW1hZ2UoKTtcbiAgICAgICAgICAgIGNhc2UgJ3NldF9yZWZlcmVuY2VfaW1hZ2VfcG9zaXRpb24nOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNldFJlZmVyZW5jZUltYWdlUG9zaXRpb24oYS54LCBhLnkpO1xuICAgICAgICAgICAgY2FzZSAnc2V0X3JlZmVyZW5jZV9pbWFnZV9zY2FsZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0UmVmZXJlbmNlSW1hZ2VTY2FsZShhLnN4LCBhLnN5KTtcbiAgICAgICAgICAgIGNhc2UgJ3NldF9yZWZlcmVuY2VfaW1hZ2Vfb3BhY2l0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0UmVmZXJlbmNlSW1hZ2VPcGFjaXR5KGEub3BhY2l0eSk7XG4gICAgICAgICAgICBjYXNlICdsaXN0X3JlZmVyZW5jZV9pbWFnZXMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxpc3RSZWZlcmVuY2VJbWFnZXMoKTtcbiAgICAgICAgICAgIGNhc2UgJ2NsZWFyX2FsbF9yZWZlcmVuY2VfaW1hZ2VzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jbGVhckFsbFJlZmVyZW5jZUltYWdlcygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBhZGRSZWZlcmVuY2VJbWFnZShwYXRoczogc3RyaW5nW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdhZGQtaW1hZ2UnLCBwYXRocykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZGVkUGF0aHM6IHBhdGhzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IHBhdGhzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBZGRlZCAke3BhdGhzLmxlbmd0aH0gcmVmZXJlbmNlIGltYWdlKHMpYFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVtb3ZlUmVmZXJlbmNlSW1hZ2UocGF0aHM/OiBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlbW92ZS1pbWFnZScsIHBhdGhzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gcGF0aHMgJiYgcGF0aHMubGVuZ3RoID4gMCA/IFxuICAgICAgICAgICAgICAgICAgICBgUmVtb3ZlZCAke3BhdGhzLmxlbmd0aH0gcmVmZXJlbmNlIGltYWdlKHMpYCA6IFxuICAgICAgICAgICAgICAgICAgICAnUmVtb3ZlZCBjdXJyZW50IHJlZmVyZW5jZSBpbWFnZSc7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzd2l0Y2hSZWZlcmVuY2VJbWFnZShwYXRoOiBzdHJpbmcsIHNjZW5lVVVJRD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXJncyA9IHNjZW5lVVVJRCA/IFtwYXRoLCBzY2VuZVVVSURdIDogW3BhdGhdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3N3aXRjaC1pbWFnZScsIC4uLmFyZ3MpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVVVUlEOiBzY2VuZVVVSUQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3dpdGNoZWQgdG8gcmVmZXJlbmNlIGltYWdlOiAke3BhdGh9YFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0UmVmZXJlbmNlSW1hZ2VEYXRhKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCBrZXksIHZhbHVlKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5OiBrZXksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUmVmZXJlbmNlIGltYWdlICR7a2V5fSBzZXQgdG8gJHt2YWx1ZX1gXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVJlZmVyZW5jZUltYWdlQ29uZmlnKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWNvbmZpZycpLnRoZW4oKGNvbmZpZzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGNvbmZpZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Q3VycmVudFJlZmVyZW5jZUltYWdlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWN1cnJlbnQnKS50aGVuKChjdXJyZW50OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3VycmVudFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlZnJlc2hSZWZlcmVuY2VJbWFnZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdyZWZyZXNoJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdSZWZlcmVuY2UgaW1hZ2UgcmVmcmVzaGVkJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNldFJlZmVyZW5jZUltYWdlUG9zaXRpb24oeDogbnVtYmVyLCB5OiBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ3gnLCB4KTtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAneScsIHkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiB4LFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2UgcG9zaXRpb24gc2V0IHRvICgke3h9LCAke3l9KWBcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRSZWZlcmVuY2VJbWFnZVNjYWxlKHN4OiBudW1iZXIsIHN5OiBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ3N4Jywgc3gpO1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdzeScsIHN5KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3g6IHN4LFxuICAgICAgICAgICAgICAgICAgICAgICAgc3k6IHN5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlZmVyZW5jZSBpbWFnZSBzY2FsZSBzZXQgdG8gKCR7c3h9LCAke3N5fSlgXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0UmVmZXJlbmNlSW1hZ2VPcGFjaXR5KG9wYWNpdHk6IG51bWJlcik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ29wYWNpdHknLCBvcGFjaXR5KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3BhY2l0eTogb3BhY2l0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2Ugb3BhY2l0eSBzZXQgdG8gJHtvcGFjaXR5fWBcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxpc3RSZWZlcmVuY2VJbWFnZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdxdWVyeS1jb25maWcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWN1cnJlbnQnKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uZmlnOiBjb25maWcsXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50OiBjdXJyZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1JlZmVyZW5jZSBpbWFnZSBpbmZvcm1hdGlvbiByZXRyaWV2ZWQnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJBbGxSZWZlcmVuY2VJbWFnZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBhbGwgcmVmZXJlbmNlIGltYWdlcyBieSBjYWxsaW5nIHJlbW92ZS1pbWFnZSB3aXRob3V0IHBhdGhzXG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlbW92ZS1pbWFnZScpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQWxsIHJlZmVyZW5jZSBpbWFnZXMgY2xlYXJlZCdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==