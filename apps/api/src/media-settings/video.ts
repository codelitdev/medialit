/**
 * The video media settings (pipelines-phase-1.md, D1): `videoStreaming` and
 * `hlsRenditions`, their defaults, and the checks every client goes through.
 * Each app chooses for itself: there is no account-wide default, and an app
 * that never chose is `off`.
 */
import type { VideoStreaming } from "../db/schema";

export type { VideoStreaming };

export const VIDEO_STREAMING_VALUES: readonly VideoStreaming[] = [
    "off",
    "hls",
    "mp4",
];

/** The renditions users can choose, largest first. 1440p and 2160p wait for
 * bigger workers (D1). */
export const HLS_RENDITIONS = ["1080p", "720p", "480p", "360p"] as const;
export type HlsRendition = (typeof HLS_RENDITIONS)[number];

export const DEFAULT_HLS_RENDITIONS: readonly HlsRendition[] = [
    "1080p",
    "720p",
    "480p",
];

export class VideoSettingsError extends Error {}

export function isVideoStreaming(value: unknown): value is VideoStreaming {
    return VIDEO_STREAMING_VALUES.includes(value as VideoStreaming);
}

/** Checks renditions against the fixed list, drops duplicates and sorts
 * them largest first. Throws `VideoSettingsError` for anything else. */
export function normalizeRenditions(value: unknown): HlsRendition[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new VideoSettingsError(
            `hlsRenditions must be a non-empty list of ${HLS_RENDITIONS.join(", ")}`,
        );
    }
    for (const item of value) {
        if (!HLS_RENDITIONS.includes(item as HlsRendition)) {
            throw new VideoSettingsError(
                `Unknown rendition "${String(item)}". Use ${HLS_RENDITIONS.join(", ")}`,
            );
        }
    }
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
                ? HLS_RENDITIONS.filter((r) => renditions.includes(r))
                : [...DEFAULT_HLS_RENDITIONS],
    };
}
