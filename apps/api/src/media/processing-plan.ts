/**
 * Which jobs seal queues for a media item (pipelines-phase-1.md, D11), with
 * the settings each job uses copied into its params (phase 0, D9), so a job
 * retried later still uses the settings in effect at seal.
 */
import type { AccountPlan } from "../billing/entitlements";
import type { MediaMetadata } from "./probe";
import type { ProcessingOverride } from "@medialit/models";
import type { VideoSettings } from "../media-settings/video";

export const POSTER_JOB = "media.poster";
export const POSTER_ATTEMPTS = 3;
/** Kept here, not in mp4.ts, so seal doesn't load the encoders. */
export const MP4_JOB_TYPE = "media.mp4";
export const HLS_JOB_TYPE = "media.hls";
/** Captions (pipelines-phase-2.md, D2), in the `transcribe` class. */
export const CAPTIONS_JOB_TYPE = "media.captions";
export const CAPTIONS_ATTEMPTS = 3;
/** The captions derivative's folder and files (D6). */
export const CAPTIONS_KEY = "captions/";
export const CAPTION_FILES = {
    vtt: "captions.vtt",
    text: "transcript.txt",
    json: "transcript.json",
} as const;
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
    /** Captions in effect for this upload (D1, D9). */
    generateCaptions?: boolean;
    plan: AccountPlan;
};

/** True when the media should be processed as a video: a video type, and
 * metadata that didn't find it to be audio only. */
export function isVideo(input: Pick<PlanInput, "mimeType" | "metadata">) {
    if (!input.mimeType.toLowerCase().startsWith("video/")) return false;
    return input.metadata === null || input.metadata.kind === "video";
}

/** True when the media should be captioned as audio: an audio type, or a
 * video type that metadata found to be audio only (D10). */
export function isAudio(input: Pick<PlanInput, "mimeType" | "metadata">) {
    const type = input.mimeType.toLowerCase();
    if (type.startsWith("audio/")) return input.metadata?.kind !== "image";
    return type.startsWith("video/") && input.metadata?.kind === "audio";
}

/** True when seal read the file and found no audio stream. Unknown
 * metadata is not absent: the job probes again. */
function audioKnownAbsent(metadata: MediaMetadata | null): boolean {
    return (
        metadata !== null &&
        metadata.audioCodec === undefined &&
        metadata.sampleRate === undefined &&
        metadata.channels === undefined
    );
}

function captionsJob(input: PlanInput, source: "video" | "audio_upload") {
    return {
        type: CAPTIONS_JOB_TYPE,
        derivative: "captions",
        params: {
            source,
            ...(input.metadata?.durationSeconds
                ? { durationSeconds: input.metadata.durationSeconds }
                : {}),
        },
        priority: priorityFor(input.plan),
        maxAttempts: CAPTIONS_ATTEMPTS,
    };
}

export function planProcessing(input: PlanInput): PlannedJob[] {
    if (isAudio(input)) {
        return input.generateCaptions
            ? [captionsJob(input, "audio_upload")]
            : [];
    }
    if (!isVideo(input)) return [];
    const priority = priorityFor(input.plan);
    const jobs: PlannedJob[] = [
        {
            type: POSTER_JOB,
            // The poster replaces the upload thumbnail (D9).
            derivative: "thumbnail",
            params: {
                publicKey: "thumb.webp",
                ...(input.metadata?.durationSeconds
                    ? { durationSeconds: input.metadata.durationSeconds }
                    : {}),
            },
            priority,
            maxAttempts: POSTER_ATTEMPTS,
        },
    ];
    if (input.video.videoStreaming === "hls") {
        jobs.push({
            type: HLS_JOB_TYPE,
            derivative: "hls",
            params: { hlsRenditions: input.video.hlsRenditions },
            priority,
            maxAttempts: VIDEO_ENCODE_ATTEMPTS,
        });
    }
    if (input.video.videoStreaming === "mp4") {
        jobs.push({
            type: MP4_JOB_TYPE,
            derivative: "mp4",
            params: {},
            priority,
            maxAttempts: VIDEO_ENCODE_ATTEMPTS,
        });
    }
    if (input.generateCaptions && !audioKnownAbsent(input.metadata)) {
        jobs.push(captionsJob(input, "video"));
    }
    return jobs;
}

/** The app's video settings with the seal's override applied
 * (pipelines-phase-2.md, D9). A field the override leaves out keeps the
 * app's value. */
export function withOverride(
    settings: VideoSettings,
    processing: ProcessingOverride | undefined,
): VideoSettings {
    return {
        ...settings,
        ...(processing?.videoStreaming
            ? { videoStreaming: processing.videoStreaming }
            : {}),
    };
}

/** Whether to make captions: the seal's override, else the app's setting. */
export function captionsInEffect(
    appSetting: boolean | null | undefined,
    processing: ProcessingOverride | undefined,
): boolean {
    return processing?.generateCaptions ?? appSetting ?? false;
}

/** True when the seal set at least one processing field. */
export function isOverride(
    processing: ProcessingOverride | undefined,
): boolean {
    return (
        processing?.videoStreaming !== undefined ||
        processing?.generateCaptions !== undefined
    );
}
