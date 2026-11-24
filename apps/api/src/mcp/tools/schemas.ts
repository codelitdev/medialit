import { HLS_RENDITIONS } from "../../media-settings/video";
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
    metadata: z
        .object({
            kind: z.enum(["video", "audio", "image"]),
            durationSeconds: z.number().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            rotation: z.number().optional(),
            frameRate: z.number().optional(),
            videoCodec: z.string().optional(),
            audioCodec: z.string().optional(),
            bitrate: z.number().optional(),
            sampleRate: z.number().optional(),
            channels: z.number().optional(),
            format: z.string().optional(),
        })
        .nullable()
        .optional()
        .describe(
            "Duration, size, codecs and format, read at seal. Null before seal",
        ),
});

export const mediaListItemSchema = mediaSchema.omit({
    file: true,
    processing: true,
    derivatives: true,
    metadata: true,
});

export const mediaListSchema = z.object({
    mediaItems: z.array(mediaListItemSchema),
});

export const storageSchema = z.object({
    storage: z.number(),
    maxStorage: z.number(),
    /** This month's video processing minutes; `allowed` is null when there
     * is no limit. */
    processingMinutes: z.object({
        used: z.number(),
        allowed: z.number().nullable(),
    }),
});

export const mediaSettingsSchema = z.object({
    useWebP: z.boolean(),
    webpOutputQuality: z.number().min(1).max(100),
    videoStreaming: z.enum(["off", "hls", "mp4"]),
    hlsRenditions: z.array(z.enum(HLS_RENDITIONS)),
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
