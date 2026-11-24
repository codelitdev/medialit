export const VIDEO_STREAMING_VALUES = ["off", "hls", "mp4"] as const;
export type VideoStreaming = (typeof VIDEO_STREAMING_VALUES)[number];

/** The HLS renditions an app can choose, largest first. */
export const HLS_RENDITIONS = ["1080p", "720p", "480p", "360p"] as const;
export type HlsRendition = (typeof HLS_RENDITIONS)[number];

export type MediaSettings = {
    useWebP: boolean;
    webpOutputQuality: number;
    videoStreaming: VideoStreaming;
    hlsRenditions: HlsRendition[];
};

/** This month's video processing minutes. `allowed` is null when there is
 * no limit (self-hosted). */
export type ProcessingMinutes = { used: number; allowed: number | null };
