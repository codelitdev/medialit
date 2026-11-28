import Joi from "joi";
import { HLS_RENDITIONS, VIDEO_STREAMING_VALUES } from "./video";
import type { HlsRendition, VideoStreaming } from "./video";

export interface MediaSettingsResponse {
    useWebP: boolean;
    webpOutputQuality: number;
    /** `off`, `hls` or `mp4`. Apps start `off`. */
    videoStreaming: VideoStreaming;
    hlsRenditions: HlsRendition[];
    /** Make captions for sealed video and audio. Apps start `false`. */
    generateCaptions: boolean;
    /** True when a transcription worker is running, so captions can be
     * made (pipelines-phase-2.md, D1). Read-only. */
    captionsAvailable: boolean;
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
    generateCaptions: Joi.boolean(),
});

export const mediaSettingsResponseSchema = Joi.object<MediaSettingsResponse>({
    useWebP: Joi.boolean(),
    webpOutputQuality: Joi.number().integer().min(1).max(100),
    videoStreaming: Joi.string().valid(...VIDEO_STREAMING_VALUES),
    hlsRenditions: Joi.array().items(Joi.string().valid(...HLS_RENDITIONS)),
    generateCaptions: Joi.boolean(),
    captionsAvailable: Joi.boolean().description(
        "True when a transcription worker is running, so captions can be made",
    ),
});
