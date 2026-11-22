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
    processing: z
        .object({
            status: z.enum(["pending", "processing", "ready", "failed"]),
            error: z.string().optional(),
        })
        .optional()
        .describe("Background processing of the media after seal"),
    derivatives: z
        .record(
            z.object({
                status: z.enum(["queued", "processing", "ready", "failed"]),
                url: z.string().optional(),
                mimeType: z.string().optional(),
                size: z.number().optional(),
                error: z.string().optional(),
            }),
        )
        .optional()
        .describe("Outputs made from the original, by name"),
});

export const mediaListItemSchema = mediaSchema.omit({
    file: true,
    processing: true,
    derivatives: true,
});

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

export const whoamiSchema = z.object({
    auth: z.enum(["oauth", "apikey"]),
    email: z.string(),
    app: z.object({
        id: z.string(),
        name: z.string(),
        default: z.boolean(),
    }),
    files: z.number(),
    storage: z.number(),
    maxStorage: z.number(),
});
