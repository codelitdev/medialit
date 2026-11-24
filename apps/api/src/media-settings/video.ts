/**
 * The video media settings, `videoStreaming` and
 * `hlsRenditions`, their defaults, and the checks every client goes through.
 * Each app chooses for itself: there is no account-wide default, and an app
 * that never chose is `off`.
 */
import {
    HLS_RENDITIONS,
    VIDEO_STREAMING_VALUES,
    type HlsRendition,
    type VideoStreaming,
} from "@medialit/models";

export { HLS_RENDITIONS, VIDEO_STREAMING_VALUES };
export type { HlsRendition, VideoStreaming };

export const DEFAULT_HLS_RENDITIONS: readonly HlsRendition[] = [
    "1080p",
    "720p",
    "480p",
];

export function isVideoStreaming(value: unknown): value is VideoStreaming {
    return (VIDEO_STREAMING_VALUES as readonly unknown[]).includes(value);
}

/** Drops duplicates and unknown sizes, and sorts the rest largest first.
 * Clients validate the list before it is saved. */
export function normalizeRenditions(value: readonly string[]): HlsRendition[] {
    return HLS_RENDITIONS.filter((rendition) => value.includes(rendition));
}

export type VideoSettings = {
    videoStreaming: VideoStreaming;
    hlsRenditions: HlsRendition[];
};

/** The settings in effect for an app. Nothing stored means `off`. */
export function effectiveVideoSettings(
    stored: {
        videoStreaming?: VideoStreaming | null;
        hlsRenditions?: string[] | null;
    } | null,
): VideoSettings {
    const chosen = stored?.videoStreaming;
    const renditions = stored?.hlsRenditions;
    return {
        videoStreaming: isVideoStreaming(chosen) ? chosen : "off",
        hlsRenditions:
            renditions && renditions.length > 0
                ? normalizeRenditions(renditions)
                : [...DEFAULT_HLS_RENDITIONS],
    };
}
