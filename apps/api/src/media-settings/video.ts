/**
 * The video media settings (pipelines-phase-1.md, D1): `videoStreaming` and
 * `hlsRenditions`, their defaults, and the checks every client goes through.
 */
import type { AccountPlan } from "../billing/entitlements";
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

/** New apps follow the plan: HLS on self-hosted installs and the paid plan,
 * off on the free plan, so free minutes aren't spent without asking. */
export function defaultVideoStreaming(plan: AccountPlan): VideoStreaming {
    return plan === "basic" ? "off" : "hls";
}

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
    /** True when the app didn't choose, and the plan decides. */
    videoStreamingDefault: boolean;
    hlsRenditions: HlsRendition[];
};

/** The settings in effect for an app, from what it stored and its plan. */
export function effectiveVideoSettings(
    stored: {
        videoStreaming?: VideoStreaming | null;
        hlsRenditions?: string[] | null;
    } | null,
    plan: AccountPlan,
): VideoSettings {
    const chosen = stored?.videoStreaming;
    const renditions = stored?.hlsRenditions;
    return {
        videoStreaming: isVideoStreaming(chosen)
            ? chosen
            : defaultVideoStreaming(plan),
        videoStreamingDefault: !isVideoStreaming(chosen),
        hlsRenditions:
            renditions && renditions.length > 0
                ? HLS_RENDITIONS.filter((r) => renditions.includes(r))
                : [...DEFAULT_HLS_RENDITIONS],
    };
}
