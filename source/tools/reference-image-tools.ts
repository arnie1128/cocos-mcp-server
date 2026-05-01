import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class ReferenceImageTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'add_reference_image',
                description: 'Add absolute image paths to the reference-image module; does not create assets.',
                inputSchema: z.object({
                    paths: z.array(z.string()).describe('Absolute image file paths to add as scene reference images.'),
                }),
                handler: a => this.addReferenceImage(a.paths),
            },
            {
                name: 'remove_reference_image',
                description: 'Remove specific reference images, or current image when paths are omitted.',
                inputSchema: z.object({
                    paths: z.array(z.string()).optional().describe('Reference image paths to remove. Omit/empty removes the current image.'),
                }),
                handler: a => this.removeReferenceImage(a.paths),
            },
            {
                name: 'switch_reference_image',
                description: 'Switch active reference image by absolute path, optionally scoped to scene UUID.',
                inputSchema: z.object({
                    path: z.string().describe('Absolute reference image path to make current.'),
                    sceneUUID: z.string().optional().describe('Optional scene UUID scope for the switch.'),
                }),
                handler: a => this.switchReferenceImage(a.path, a.sceneUUID),
            },
            {
                name: 'set_reference_image_data',
                description: 'Set one raw reference-image display property: path/x/y/sx/sy/opacity.',
                inputSchema: z.object({
                    key: z.enum(['path', 'x', 'y', 'sx', 'sy', 'opacity']).describe('Reference image property key to set.'),
                    value: z.any().describe('Property value: path string, x/y/sx/sy number, or opacity 0-1.'),
                }),
                handler: a => this.setReferenceImageData(a.key, a.value),
            },
            {
                name: 'query_reference_image_config',
                description: 'Read reference-image module configuration.',
                inputSchema: z.object({}),
                handler: () => this.queryReferenceImageConfig(),
            },
            {
                name: 'query_current_reference_image',
                description: 'Read current reference-image state.',
                inputSchema: z.object({}),
                handler: () => this.queryCurrentReferenceImage(),
            },
            {
                name: 'refresh_reference_image',
                description: 'Refresh reference-image display without changing image data.',
                inputSchema: z.object({}),
                handler: () => this.refreshReferenceImage(),
            },
            {
                name: 'set_reference_image_position',
                description: 'Set current reference image x/y offsets.',
                inputSchema: z.object({
                    x: z.number().describe('Reference image X offset.'),
                    y: z.number().describe('Reference image Y offset.'),
                }),
                handler: a => this.setReferenceImagePosition(a.x, a.y),
            },
            {
                name: 'set_reference_image_scale',
                description: 'Set current reference image x/y scale.',
                inputSchema: z.object({
                    sx: z.number().min(0.1).max(10).describe('Reference image X scale, 0.1-10.'),
                    sy: z.number().min(0.1).max(10).describe('Reference image Y scale, 0.1-10.'),
                }),
                handler: a => this.setReferenceImageScale(a.sx, a.sy),
            },
            {
                name: 'set_reference_image_opacity',
                description: 'Set current reference image opacity.',
                inputSchema: z.object({
                    opacity: z.number().min(0).max(1).describe('Reference image opacity from 0.0 to 1.0.'),
                }),
                handler: a => this.setReferenceImageOpacity(a.opacity),
            },
            {
                name: 'list_reference_images',
                description: 'Read reference-image config plus current image data.',
                inputSchema: z.object({}),
                handler: () => this.listReferenceImages(),
            },
            {
                name: 'clear_all_reference_images',
                description: 'Remove reference images from the module; does not delete files/assets.',
                inputSchema: z.object({}),
                handler: () => this.clearAllReferenceImages(),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

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
