import Joi from "joi";
import { AccessControl } from "@medialit/models";

/** Opaque to the server; letters, digits and `.`, `_`, `:`, `-` keep it safe
 * to log and to use in a URL. */
export const assetIdSchema = Joi.string()
    .pattern(/^[A-Za-z0-9._:-]{1,200}$/)
    .messages({
        "string.pattern.base":
            '"assetId" must be 1 to 200 letters, digits, ".", "_", ":" or "-"',
    });

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 8601. A little in the future is clock skew; far ahead is a mistake. */
export const takenAtSchema = Joi.date()
    .iso()
    .min("1970-01-01T00:00:00.000Z")
    .custom((value: Date, helpers) =>
        value.getTime() > Date.now() + ONE_DAY_MS
            ? helpers.error("date.max", { limit: "tomorrow" })
            : value,
    );

export const uploadMediaSchema = Joi.object({
    caption: Joi.string().optional().allow(""),
    access: Joi.string().valid("public", "private").optional(),
    group: Joi.string().optional(),
    assetId: assetIdSchema.optional(),
    takenAt: takenAtSchema.optional(),
});

export const MAX_ASSET_LOOKUP = 200;

export const assetLookupSchema = Joi.object({
    assetIds: Joi.array()
        .items(assetIdSchema)
        .min(1)
        .max(MAX_ASSET_LOOKUP)
        .required(),
});

export const assetLookupResponseSchema = Joi.array().items(
    Joi.object({
        assetId: Joi.string().required(),
        mediaId: Joi.string().required(),
        sealed: Joi.boolean().required(),
    }),
);

export const MAX_TIMELINE_PAGE = 200;

export const timelineQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(MAX_TIMELINE_PAGE).default(50),
    cursor: Joi.string().max(512),
    kind: Joi.string().valid("image", "video", "pdf", "other"),
    access: Joi.string().valid("public", "private"),
    group: Joi.string(),
});

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
    assetId?: string;
    takenAt?: Date;
    width?: number;
    height?: number;
    durationMs?: number;
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

export interface TimelineItemResponse extends MediaListItemResponse {
    /** `null` when the uploader sent none; order by `createdAt` then. */
    takenAt: Date | null;
    assetId?: string;
    width?: number;
    height?: number;
    durationMs?: number;
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
    assetId: Joi.string().optional(),
    takenAt: Joi.date().iso().optional(),
    width: Joi.number().optional(),
    height: Joi.number().optional(),
    durationMs: Joi.number().optional(),
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
});

export const timelineResponseSchema = Joi.object({
    items: Joi.array()
        .items(
            (mediaListItemResponseSchema as Joi.ObjectSchema).keys({
                takenAt: Joi.date().iso().allow(null).required(),
                assetId: Joi.string().optional(),
                width: Joi.number().optional(),
                height: Joi.number().optional(),
                durationMs: Joi.number().optional(),
            }),
        )
        .required(),
    nextCursor: Joi.string().allow(null).required(),
});
