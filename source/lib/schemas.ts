import { z } from './schema';

/** Vec3 / Vec2 / Vec4 zod shapes with optional fields (matches Cocos coordinate inputs). */
export const vec2Schema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
});

export const vec3Schema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
});

export const vec4Schema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    w: z.number().optional(),
});

/** Color shape (RGBA, 0-255). */
export const colorSchema = z.object({
    r: z.number().min(0).max(255).optional(),
    g: z.number().min(0).max(255).optional(),
    b: z.number().min(0).max(255).optional(),
    a: z.number().min(0).max(255).optional(),
});
