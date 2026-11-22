import Joi from "joi";
import { AccessControl } from "@medialit/models";

export const uploadMediaSchema = Joi.object({
    caption: Joi.string().optional().allow(""),
    access: Joi.string().valid("public", "private").optional(),
    group: Joi.string().optional(),
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
    /** Background processing of sealed media. */
    processing: {
        status: "pending" | "processing" | "ready" | "failed";
        error?: string;
    };
    /** Outputs made from the original, by name. `url` is set once ready. */
    derivatives: Record<
        string,
        {
            status: "queued" | "processing" | "ready" | "failed";
            url?: string;
            mimeType?: string;
            size?: number;
            error?: string;
        }
    >;
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
