import Joi from "joi";
import { HLS_RENDITIONS, VIDEO_STREAMING_VALUES } from "./video";
import type { HlsRendition, VideoStreaming } from "./video";

export interface MediaSettingsResponse {
    useWebP: boolean;
    webpOutputQuality: number;
    thumbnailHeight: number;
    thumbnailWidth: number;
    /** `off`, `hls` or `mp4`, as in effect now. */
    videoStreaming: VideoStreaming;
    /** True when the app hasn't chosen and the account's plan decides. */
    videoStreamingDefault: boolean;
    hlsRenditions: HlsRendition[];
}

/** What an update accepts. `null` sets a video setting back to its default. */
export const mediaSettingsSchema = Joi.object({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().min(0).max(100),
    thumbnailWidth: Joi.number().positive(),
    thumbnailHeight: Joi.number().positive(),
    videoStreaming: Joi.string()
        .valid(...VIDEO_STREAMING_VALUES)
        .allow(null),
    hlsRenditions: Joi.array()
        .items(Joi.string().valid(...HLS_RENDITIONS))
        .min(1)
        .allow(null),
});

export const mediaSettingsResponseSchema = Joi.object<MediaSettingsResponse>({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().min(0).max(100),
    thumbnailWidth: Joi.number().positive(),
    thumbnailHeight: Joi.number().positive(),
    videoStreaming: Joi.string().valid(...VIDEO_STREAMING_VALUES),
    videoStreamingDefault: Joi.boolean(),
    hlsRenditions: Joi.array().items(Joi.string().valid(...HLS_RENDITIONS)),
});
