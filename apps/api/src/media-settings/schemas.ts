import Joi from "joi";
import { HLS_RENDITIONS, VIDEO_STREAMING_VALUES } from "./video";
import type { HlsRendition, VideoStreaming } from "./video";

export interface MediaSettingsResponse {
    useWebP: boolean;
    webpOutputQuality: number;
    /** `off`, `hls` or `mp4`. Apps start `off`. */
    videoStreaming: VideoStreaming;
    hlsRenditions: HlsRendition[];
}

/** What an update accepts. `null` sets the HLS renditions back to the
 * default ladder. */
export const mediaSettingsSchema = Joi.object({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().integer().min(1).max(100),
    videoStreaming: Joi.string().valid(...VIDEO_STREAMING_VALUES),
    hlsRenditions: Joi.array()
        .items(Joi.string().valid(...HLS_RENDITIONS))
        .min(1)
        .allow(null),
});

export const mediaSettingsResponseSchema = Joi.object<MediaSettingsResponse>({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().integer().min(1).max(100),
    videoStreaming: Joi.string().valid(...VIDEO_STREAMING_VALUES),
    hlsRenditions: Joi.array().items(Joi.string().valid(...HLS_RENDITIONS)),
});
