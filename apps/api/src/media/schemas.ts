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
}

export const mediaResponseSchema = Joi.object<MediaResponse>({
    mediaId: Joi.string().required(),
    originalFileName: Joi.string().required(),
    mimeType: Joi.string().required(),
    size: Joi.number().required(),
    access: Joi.string().valid("public", "private").required(),
    file: Joi.string().uri().required(),
    thumbnail: Joi.string().uri().required(),
    caption: Joi.string().optional().allow(""),
    group: Joi.string().optional(),
});

export const mediaCountResponseSchema = Joi.object({
    count: Joi.number().required(),
});

export const mediaSizeResponseSchema = Joi.object({
    storage: Joi.number().required(),
    maxStorage: Joi.number().required(),
});
