/**
 * Which jobs seal queues for a media item (pipelines-phase-1.md, D11), with
 * the settings each job uses copied into its params (phase 0, D9), so a job
 * retried later still uses the settings in effect at seal.
 */
import type { AccountPlan } from "../billing/entitlements";
import type { MediaMetadata } from "./probe";
import type { VideoSettings } from "../media-settings/video";

export const POSTER_JOB = "media.poster";
export const POSTER_ATTEMPTS = 3;
/** Kept here, not in mp4.ts, so seal doesn't load the encoders. */
export const MP4_JOB_TYPE = "media.mp4";
export const VIDEO_ENCODE_ATTEMPTS = 3;

/** Paid and self-hosted encodes run before free ones (D11, Priority). The
 * queue runs the lowest number first. */
export function priorityFor(plan: AccountPlan): number {
    return plan === "basic" ? 100 : 50;
}

export type PlannedJob = {
    type: string;
    /** The derivative the job makes; also how the reconciler finds it. */
    derivative: string;
    params: Record<string, unknown>;
    priority: number;
    maxAttempts: number;
};

export type PlanInput = {
    mimeType: string;
    /** Null when seal couldn't read it. */
    metadata: MediaMetadata | null;
    video: VideoSettings;
    /** The thumbnail size the app stored, if it stored one. */
    thumbnail?: { width: number; height: number };
    plan: AccountPlan;
};

/** True when the media should be processed as a video: a video type, and
 * metadata that didn't find it to be audio only. */
export function isVideo(input: Pick<PlanInput, "mimeType" | "metadata">) {
    if (!input.mimeType.toLowerCase().startsWith("video/")) return false;
    return input.metadata === null || input.metadata.kind === "video";
}

export function planProcessing(input: PlanInput): PlannedJob[] {
    if (!isVideo(input)) return [];
    const priority = priorityFor(input.plan);
    const jobs: PlannedJob[] = [
        {
            type: POSTER_JOB,
            // The poster replaces the upload thumbnail (D9).
            derivative: "thumbnail",
            params: {
                publicKey: "thumb.webp",
                ...(input.thumbnail
                    ? {
                          thumbnailWidth: input.thumbnail.width,
                          thumbnailHeight: input.thumbnail.height,
                      }
                    : {}),
                ...(input.metadata?.durationSeconds
                    ? { durationSeconds: input.metadata.durationSeconds }
                    : {}),
            },
            priority,
            maxAttempts: POSTER_ATTEMPTS,
        },
    ];
    if (input.video.videoStreaming === "mp4") {
        jobs.push({
            type: MP4_JOB_TYPE,
            derivative: "mp4",
            params: { videoStreaming: "mp4" },
            priority,
            maxAttempts: VIDEO_ENCODE_ATTEMPTS,
        });
    }
    return jobs;
}
