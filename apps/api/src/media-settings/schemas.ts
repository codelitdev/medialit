import Joi from "joi";

export interface MediaSettingsResponse {
    useWebP: boolean;
    webpOutputQuality: number;
    thumbnailHeight: number;
    thumbnailWidth: number;
}

export const mediaSettingsSchema = Joi.object<MediaSettingsResponse>({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().min(0).max(100),
    thumbnailWidth: Joi.number().positive(),
    thumbnailHeight: Joi.number().positive(),
});

export const mediaSettingsResponseSchema = mediaSettingsSchema;
