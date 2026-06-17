import { z } from "zod";

const accessSchema = z.enum(["public", "private"]);

export const mediaSchema = z.object({
    mediaId: z.string(),
    originalFileName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    access: accessSchema,
    file: z.string(),
    thumbnail: z.string().optional(),
    caption: z.string().optional(),
    group: z.string().optional(),
});

export const mediaListItemSchema = mediaSchema.omit({ file: true });

export const mediaListSchema = z.object({
    mediaItems: z.array(mediaListItemSchema),
});

export const storageSchema = z.object({
    storage: z.number(),
    maxStorage: z.number(),
});

export const mediaSettingsSchema = z.object({
    useWebP: z.boolean(),
    webpOutputQuality: z.number().min(0).max(100),
    thumbnailWidth: z.number().positive(),
    thumbnailHeight: z.number().positive(),
});

export const successMessageSchema = z.object({
    message: z.string(),
});

export const signatureSchema = z.object({
    signature: z.string(),
});
