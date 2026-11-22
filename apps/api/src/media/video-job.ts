/**
 * What every video encode does with its input (pipelines-phase-1.md, D4):
 *
 * 1. Refuses sources over `VIDEO_MAX_SOURCE_BYTES` before downloading.
 * 2. Downloads the original to a local work directory (a presigned URL
 *    expires during a long encode), so ffmpeg reads only a local file.
 * 3. Probes it and refuses sources that are too long, too large or have no
 *    video.
 * 4. Reserves processing minutes when the encode needs them (D8).
 * 5. Runs the encode under `prlimit` with a timeout from the duration.
 * 6. Uploads the output and removes the work directory in every case.
 *
 * Retry rules: ffmpeg exiting with an error, the timeout, and every limit
 * fail for good. Storage and database errors, and ffmpeg killed by a
 * signal other than the job's own abort, are retried. Minutes are released
 * when the job fails for good.
 */
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { ProcessLimitError } from "@medialit/images";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { tempFileDirForUploads } from "../config/constants";
import { downloadObject, headObject } from "../services/s3";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { resolveAccountPlan } from "../billing/entitlements";
import {
    minutesFor,
    releaseMinutes,
    reserveMinutes,
} from "../billing/processing-minutes";
import { JobError, describeError, permanentError } from "../jobs/errors";
import type { JobClass } from "../jobs/runner";
import {
    derivativeJob,
    type DerivativeOutput,
    type ProduceContext,
} from "./derivatives";
import { originalLocation } from "./poster";
import { probeMedia, type ProbeResult } from "./probe";

function positiveFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return process.env[name] && Number.isFinite(value) && value > 0
        ? value
        : fallback;
}

/** Limits, read on each job so tests can change them. */
export function videoLimits() {
    return {
        maxSourceBytes: positiveFromEnv(
            "VIDEO_MAX_SOURCE_BYTES",
            1024 * 1024 * 1024,
        ),
        maxDurationSeconds: positiveFromEnv("VIDEO_MAX_DURATION_SECONDS", 7200),
        /** Address space ffmpeg may reserve (`prlimit --as`): a guard
         * against a decoder that runs away, not a cap on memory in use.
         * x264 reserves far more than it uses; at 2 threads, a 4K source
         * reserves under 3 GB and uses about 0.5 GB. */
        maxMemoryMb: positiveFromEnv("VIDEO_MAX_MEMORY_MB", 3072),
        /** Encoder and decoder threads. Match the worker's CPUs: more only
         * reserve more memory. */
        threads: Math.floor(positiveFromEnv("VIDEO_ENCODE_THREADS", 2)),
        /** Sources up to 2160p on the short side, 4096 px on the long. */
        maxShortSide: 2160,
        maxLongSide: 4096,
    };
}

/** How long an encode may run: four times the source, at least 15 min. */
export function encodeTimeoutMs(durationSeconds: number): number {
    return Math.max(15 * 60 * 1000, 4 * durationSeconds * 1000);
}

/** The job type's own timeout: the longest any encode may run, plus time
 * for the download and the upload. The job enforces the real limit. */
export function videoJobTimeoutMs(): number {
    return encodeTimeoutMs(videoLimits().maxDurationSeconds) + 30 * 60 * 1000;
}

export type EncodeInput = {
    /** The downloaded original. */
    source: string;
    /** A directory for the output, removed afterwards. */
    workDir: string;
    probe: ProbeResult;
    durationSeconds: number;
    params: Record<string, unknown>;
    signal: AbortSignal;
    limits: ReturnType<typeof videoLimits>;
    timeoutMs: number;
    /** Call before an encode that costs minutes. Throws when the account
     * is out of them. Returns the minutes charged. */
    reserve: () => Promise<number>;
    context: ProduceContext;
};

export type EncodeResult = {
    output: DerivativeOutput;
    /** For logs and events. */
    remux?: boolean;
    renditions?: string[];
    minutesCharged: number;
};

/** Refuses with a code the media keeps in its derivative error. */
function refuse(
    code: "source_too_large" | "source_too_long" | "no_video_stream",
    detail: string,
): JobError {
    return permanentError(`${code}: ${detail}`, code);
}

/**
 * A derivative job that encodes video. `encode` runs on the downloaded
 * original and returns its output, already uploaded.
 */
export function videoJob(definition: {
    type: string;
    name: "hls" | "mp4";
    maxAttempts: number;
    encode: (input: EncodeInput) => Promise<EncodeResult>;
}) {
    const jobClass: JobClass = "video";
    return derivativeJob({
        type: definition.type,
        name: definition.name,
        class: jobClass,
        maxAttempts: definition.maxAttempts,
        timeoutMs: videoJobTimeoutMs(),
        produce: async (context) => {
            const startedAt = Date.now();
            const { media, job } = context;
            const fields = {
                media_id: media.mediaId,
                app_id: media.appId,
                job_id: job.id,
                output: definition.name,
            };
            const limits = videoLimits();
            let probe: ProbeResult | null = null;
            let reserved = false;
            const tempRoot = tempFileDirForUploads || os.tmpdir();
            await mkdir(tempRoot, { recursive: true });
            const workDir = await mkdtemp(
                path.join(tempRoot, `medialit-${definition.name}-`),
            );
            try {
                const original = originalLocation(media);
                const head = await headObject({
                    Key: original.key,
                    Bucket: original.bucket,
                });
                const bytes = head.ContentLength ?? 0;
                if (bytes > limits.maxSourceBytes) {
                    throw refuse(
                        "source_too_large",
                        `the video is ${bytes} bytes, over the ${limits.maxSourceBytes} byte limit`,
                    );
                }

                const source = path.join(workDir, "source");
                await downloadObject({
                    Key: original.key,
                    Bucket: original.bucket,
                    destination: source,
                    abortSignal: context.signal,
                });

                probe = await probeMedia(source, {
                    timeoutMs: 60_000,
                    signal: context.signal,
                }).catch((err: unknown) => {
                    if (context.signal.aborted) throw err;
                    return null;
                });
                if (!probe || !probe.details.hasVideo) {
                    throw refuse(
                        "no_video_stream",
                        "the file has no video that can be read",
                    );
                }
                await fillMetadata(media.id, probe);
                const duration = probe.metadata.durationSeconds ?? 0;
                const width = probe.metadata.width ?? 0;
                const height = probe.metadata.height ?? 0;
                if (duration > limits.maxDurationSeconds) {
                    throw refuse(
                        "source_too_long",
                        `the video is ${Math.round(duration)} s long, over the ${limits.maxDurationSeconds} s limit`,
                    );
                }
                if (
                    Math.min(width, height) > limits.maxShortSide ||
                    Math.max(width, height) > limits.maxLongSide
                ) {
                    throw refuse(
                        "source_too_large",
                        `the video is ${width}x${height}, over 2160p`,
                    );
                }

                const result = await definition.encode({
                    source,
                    workDir,
                    probe,
                    durationSeconds: duration,
                    params: context.params,
                    signal: context.signal,
                    limits,
                    // A header that understates the length makes this
                    // shorter, never longer.
                    timeoutMs: encodeTimeoutMs(duration),
                    reserve: async () => {
                        const minutes = minutesFor(duration);
                        const plan = await resolveAccountPlan({
                            id: media.userId,
                        });
                        const reservation = await reserveMinutes({
                            userId: media.userId,
                            appId: media.appId,
                            mediaRowId: media.id,
                            jobId: job.id,
                            kind: definition.name,
                            minutes,
                            plan,
                        });
                        if (!reservation.ok) {
                            throw permanentError(
                                `out_of_processing_minutes: the video needs ${reservation.needed} minutes and ${reservation.allowed - reservation.used} of ${reservation.allowed} are left this month`,
                                "out_of_processing_minutes",
                            );
                        }
                        reserved = reservation.charged > 0;
                        return reservation.charged;
                    },
                    context,
                });

                const tookMs = Date.now() - startedAt;
                const summary = {
                    ...fields,
                    remux: result.remux ?? false,
                    ...(result.renditions
                        ? { renditions: result.renditions }
                        : {}),
                    source_duration_s: duration,
                    source_height: Math.min(width, height),
                    video_codec: probe.metadata.videoCodec,
                    duration_ms: tookMs,
                    speed:
                        tookMs > 0
                            ? Math.round((duration / (tookMs / 1000)) * 100) /
                              100
                            : undefined,
                    size_bytes: result.output.size,
                    minutes_charged: result.minutesCharged,
                };
                logger.info(summary, "video encode finished");
                trackEvent({
                    event: "video.encoded",
                    source: `media.${definition.name}`,
                    appId: media.appId,
                    userId: media.userId,
                    properties: summary,
                });
                return result.output;
            } catch (err) {
                const failure = classify(err, context.signal);
                const lastAttempt = job.attempts >= job.maxAttempts;
                if (!failure.retryable || lastAttempt) {
                    if (reserved) {
                        await releaseMinutes(job.id, failure.reason).catch(
                            () => 0,
                        );
                    }
                    reportFailure(fields, failure, probe, media);
                }
                throw failure;
            } finally {
                await rm(workDir, { recursive: true, force: true }).catch(
                    () => {},
                );
            }
        },
    });
}

/** Turns an encode failure into a job error with the retry rules above. */
function classify(err: unknown, signal: AbortSignal): JobError {
    if (err instanceof JobError) return err;
    if (err instanceof ProcessLimitError) {
        if (err.reason === "timeout") {
            return permanentError(describeError(err), "timeout");
        }
        if (err.reason === "aborted" || signal.aborted) {
            return new JobError(describeError(err), {
                reason: "cancelled",
                retryable: true,
            });
        }
        // Killed by a signal (out of memory, for example): maybe the
        // worker, not the file. Exiting with an error: the file.
        if (err.exit.signal) {
            return new JobError(describeError(err), {
                reason: "internal",
                retryable: true,
            });
        }
        // Out of address space under VIDEO_MAX_MEMORY_MB: our limit, so an
        // exception for us, and the same limit would fail a retry.
        if (/Cannot allocate memory/i.test(err.message)) {
            return permanentError(describeError(err), "internal");
        }
        return permanentError(describeError(err), "bad_input");
    }
    return new JobError(describeError(err), {
        reason: "storage",
        retryable: true,
    });
}

function reportFailure(
    fields: Record<string, unknown>,
    failure: JobError,
    probe: ProbeResult | null,
    media: { appId: string; userId: string },
): void {
    const properties = {
        ...fields,
        failed_reason: failure.reason,
        ...(probe?.metadata.durationSeconds
            ? { source_duration_s: probe.metadata.durationSeconds }
            : {}),
        ...(probe?.metadata.videoCodec
            ? { video_codec: probe.metadata.videoCodec }
            : {}),
    };
    if (
        failure.reason === "source_too_large" ||
        failure.reason === "source_too_long" ||
        failure.reason === "no_video_stream"
    ) {
        logger.info(properties, "video source refused");
    }
    trackEvent({
        event: "video.encode_failed",
        source: `media.${String(fields.output)}`,
        appId: media.appId,
        userId: media.userId,
        properties,
    });
}

/** Seal may not have read all the metadata (the probe failed, was slow, or
 * hit its read limit); the job's probe of the whole file fills in what is
 * missing. Fields seal read are kept. */
async function fillMetadata(mediaRowId: string, probe: ProbeResult) {
    await getDb().execute(
        sql`UPDATE media SET metadata =
                ${JSON.stringify(probe.metadata)}::jsonb || coalesce(metadata, '{}'::jsonb)
            WHERE id = ${mediaRowId}`,
    );
}
