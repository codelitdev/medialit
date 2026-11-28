import Joi from "joi";
import {
    AccessControl,
    VIDEO_STREAMING_VALUES,
    type MediaDerivative,
    type MediaMetadata,
    type MediaProcessing,
} from "@medialit/models";

export const uploadMediaSchema = Joi.object({
    caption: Joi.string().optional().allow(""),
    access: Joi.string().valid("public", "private").optional(),
    group: Joi.string().optional(),
});

/** The seal request's optional `processing` override (pipelines-phase-2.md,
 * D9). Other top-level fields are ignored, as before phase 2, so a client
 * that sends extra fields keeps working. Unknown fields inside `processing` are refused, so a typo
 * doesn't silently fall back to the app's setting. */
export const sealMediaSchema = Joi.object({
    processing: Joi.object({
        videoStreaming: Joi.string()
            .valid(...VIDEO_STREAMING_VALUES)
            .optional(),
    })
        .optional()
        .allow(null),
}).unknown(true);

export const getMediaSchema = Joi.object({
    page: Joi.number().positive(),
    limit: Joi.number().positive(),
    access: Joi.string().valid("public", "private"),
    group: Joi.string(),
});

export interface MediaResponse {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: AccessControl;
    file: string;
    thumbnail: string;
    caption?: string;
    group?: string;
    /** Background processing of sealed media. */
    processing: MediaProcessing;
    /** Outputs made from the original, by name. `url` is set once ready. */
    derivatives: Record<string, MediaDerivative>;
    /** Duration, size, codecs and format, read at seal. Null before seal,
     * or when the file couldn't be read. */
    metadata: MediaMetadata | null;
}

export interface MediaListItemResponse {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: AccessControl;
    thumbnail: string;
    caption?: string;
    group?: string;
    createdAt: Date;
}

export const mediaResponseSchema = Joi.object<MediaResponse>({
    mediaId: Joi.string().required(),
    originalFileName: Joi.string().required(),
    mimeType: Joi.string().required(),
    size: Joi.number().required(),
    access: Joi.string().valid("public", "private").required(),
    file: Joi.string().uri().required(),
    thumbnail: Joi.string().uri().optional().allow(""),
    caption: Joi.string().optional().allow(""),
    group: Joi.string().optional(),
    processing: Joi.object({
        status: Joi.string()
            .valid("pending", "processing", "ready", "failed")
            .required(),
        error: Joi.string().optional(),
    }).required(),
    derivatives: Joi.object()
        .pattern(
            Joi.string(),
            Joi.object({
                status: Joi.string()
                    .valid("queued", "processing", "ready", "failed")
                    .required(),
                url: Joi.string().uri().optional(),
                mimeType: Joi.string().optional(),
                size: Joi.number().optional(),
                error: Joi.string().optional(),
            }),
        )
        .required(),
    metadata: Joi.object({
        kind: Joi.string().valid("video", "audio", "image").required(),
        durationSeconds: Joi.number().optional(),
        width: Joi.number().optional(),
        height: Joi.number().optional(),
        rotation: Joi.number().valid(0, 90, 180, 270).optional(),
        frameRate: Joi.number().optional(),
        videoCodec: Joi.string().optional(),
        audioCodec: Joi.string().optional(),
        bitrate: Joi.number().optional(),
        sampleRate: Joi.number().optional(),
        channels: Joi.number().optional(),
        format: Joi.string().optional(),
    })
        .allow(null)
        .description(
            "Duration, size, codecs and format, read at seal. Null before seal or when the file couldn't be read.",
        ),
});

export const mediaListItemResponseSchema = Joi.object<MediaListItemResponse>({
    mediaId: Joi.string().required(),
    originalFileName: Joi.string().required(),
    mimeType: Joi.string().required(),
    size: Joi.number().required(),
    access: Joi.string().valid("public", "private").required(),
    thumbnail: Joi.string().uri().optional().allow(""),
    caption: Joi.string().optional().allow(""),
    group: Joi.string().optional(),
    createdAt: Joi.date().iso().required(),
});

export const mediaCountResponseSchema = Joi.object({
    count: Joi.number().required(),
});

export const mediaSizeResponseSchema = Joi.object({
    storage: Joi.number().required(),
    maxStorage: Joi.number().required(),
    processingMinutes: Joi.object({
        used: Joi.number().required(),
        allowed: Joi.number()
            .allow(null)
            .required()
            .description("Null when there is no limit"),
    }).description("Video processing minutes this calendar month (UTC)"),
});
