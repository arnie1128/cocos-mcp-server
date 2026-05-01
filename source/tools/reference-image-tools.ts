import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z, toInputSchema, validateArgs } from '../lib/schema';

const referenceImageSchemas = {
    add_reference_image: z.object({
        paths: z.array(z.string()).describe('Absolute image file paths to add as scene reference images.'),
    }),
    remove_reference_image: z.object({
        paths: z.array(z.string()).optional().describe('Reference image paths to remove. Omit/empty removes the current image.'),
    }),
    switch_reference_image: z.object({
        path: z.string().describe('Absolute reference image path to make current.'),
        sceneUUID: z.string().optional().describe('Optional scene UUID scope for the switch.'),
    }),
    set_reference_image_data: z.object({
        key: z.enum(['path', 'x', 'y', 'sx', 'sy', 'opacity']).describe('Reference image property key to set.'),
        value: z.any().describe('Property value: path string, x/y/sx/sy number, or opacity 0-1.'),
    }),
    query_reference_image_config: z.object({}),
    query_current_reference_image: z.object({}),
    refresh_reference_image: z.object({}),
    set_reference_image_position: z.object({
        x: z.number().describe('Reference image X offset.'),
        y: z.number().describe('Reference image Y offset.'),
    }),
    set_reference_image_scale: z.object({
        sx: z.number().min(0.1).max(10).describe('Reference image X scale, 0.1-10.'),
        sy: z.number().min(0.1).max(10).describe('Reference image Y scale, 0.1-10.'),
    }),
    set_reference_image_opacity: z.object({
        opacity: z.number().min(0).max(1).describe('Reference image opacity from 0.0 to 1.0.'),
    }),
    list_reference_images: z.object({}),
    clear_all_reference_images: z.object({}),
} as const;

const referenceImageToolMeta: Record<keyof typeof referenceImageSchemas, string> = {
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

export class ReferenceImageTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(referenceImageSchemas) as Array<keyof typeof referenceImageSchemas>).map(name => ({
            name,
            description: referenceImageToolMeta[name],
            inputSchema: toInputSchema(referenceImageSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof referenceImageSchemas;
        const schema = referenceImageSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

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

    private async addReferenceImage(paths: string[]): Promise<ToolResponse> {
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
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async removeReferenceImage(paths?: string[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'remove-image', paths).then(() => {
                const message = paths && paths.length > 0 ? 
                    `Removed ${paths.length} reference image(s)` : 
                    'Removed current reference image';
                resolve({
                    success: true,
                    message: message
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async switchReferenceImage(path: string, sceneUUID?: string): Promise<ToolResponse> {
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
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async setReferenceImageData(key: string, value: any): Promise<ToolResponse> {
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
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async queryReferenceImageConfig(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'query-config').then((config: any) => {
                resolve({
                    success: true,
                    data: config
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async queryCurrentReferenceImage(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'query-current').then((current: any) => {
                resolve({
                    success: true,
                    data: current
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async refreshReferenceImage(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'refresh').then(() => {
                resolve({
                    success: true,
                    message: 'Reference image refreshed'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async setReferenceImagePosition(x: number, y: number): Promise<ToolResponse> {
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
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    private async setReferenceImageScale(sx: number, sy: number): Promise<ToolResponse> {
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
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    private async setReferenceImageOpacity(opacity: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('reference-image', 'set-image-data', 'opacity', opacity).then(() => {
                resolve({
                    success: true,
                    data: {
                        opacity: opacity,
                        message: `Reference image opacity set to ${opacity}`
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async listReferenceImages(): Promise<ToolResponse> {
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
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    private async clearAllReferenceImages(): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // Remove all reference images by calling remove-image without paths
                await Editor.Message.request('reference-image', 'remove-image');
                
                resolve({
                    success: true,
                    message: 'All reference images cleared'
                });
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }
}
