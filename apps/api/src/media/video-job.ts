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
import path from "node:path";
import { ProcessLimitError } from "@medialit/images";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
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
import {
    derivativeJob,
    type DerivativeOutput,
    type ProduceContext,
} from "./derivatives";
import { makeWorkDir, removeWorkDir } from "./work-files";
import { originalLocation } from "./poster";
import { probeMedia, type ProbeResult } from "./probe";
import { VIDEO_ENCODE_ATTEMPTS } from "./processing-plan";
import { numberFromEnv } from "../config/env";

/** Limits, read on each job so tests can change them. */
export function videoLimits() {
    return {
        maxSourceBytes: numberFromEnv(
            "VIDEO_MAX_SOURCE_BYTES",
            1024 * 1024 * 1024,
        ),
        maxDurationSeconds: numberFromEnv("VIDEO_MAX_DURATION_SECONDS", 7200),
        /** Address space ffmpeg may reserve (`prlimit --as`): a guard
         * against a decoder that runs away, not a cap on memory in use.
         * x264 reserves far more than it uses; at 2 threads, a 4K source
         * reserves under 3 GB and uses about 0.5 GB. */
        maxMemoryMb: numberFromEnv("VIDEO_MAX_MEMORY_MB", 3072),
        /** Encoder and decoder threads. Match the worker's CPUs: more only
         * reserve more memory. */
        threads: Math.floor(numberFromEnv("VIDEO_ENCODE_THREADS", 2)),
        /** Temp disk one encode may use: the source plus the output. The
         * worker's ephemeral storage must be larger. */
        maxWorkBytes: numberFromEnv(
            "VIDEO_MAX_WORK_BYTES",
            10 * 1024 * 1024 * 1024,
        ),
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
    limits: ReturnType<typeof videoLimits>;
    timeoutMs: number;
    /** Call before an encode that costs minutes. Throws when the account
     * is out of them. Returns the minutes charged. */
    reserve: () => Promise<number>;
    /**
     * The longest output, in seconds, that fits the disk budget next to the
     * source at `outputKbps` (the encode's maximum rate, audio included).
     * Throws `source_too_long` when the video is longer. Pass the result to
     * ffmpeg's `-t`, so a file whose header understates its length still
     * can't fill the disk.
     */
    maxOutputSeconds: (outputKbps: number) => number;
    /** The job's params, signal and output folder. */
    context: ProduceContext;
};

/** The longest output that fits `budgetBytes` next to `sourceBytes`. */
export function diskBoundSeconds(input: {
    budgetBytes: number;
    sourceBytes: number;
    outputKbps: number;
    maxDurationSeconds: number;
}): number {
    const bytesPerSecond = (input.outputKbps * 1000) / 8;
    const room = Math.max(0, input.budgetBytes - input.sourceBytes);
    return Math.min(
        input.maxDurationSeconds,
        Math.floor(room / bytesPerSecond),
    );
}

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
    encode: (input: EncodeInput) => Promise<EncodeResult>;
}) {
    return derivativeJob({
        type: definition.type,
        name: definition.name,
        class: "video",
        maxAttempts: VIDEO_ENCODE_ATTEMPTS,
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
            const workDir = await makeWorkDir(definition.name);
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
                    maxOutputSeconds: (outputKbps) => {
                        const seconds = diskBoundSeconds({
                            budgetBytes: limits.maxWorkBytes,
                            sourceBytes: bytes,
                            outputKbps,
                            maxDurationSeconds: limits.maxDurationSeconds,
                        });
                        if (duration > seconds) {
                            throw refuse(
                                "source_too_long",
                                `the video is ${Math.round(duration)} s long; ${seconds} s fit the ${limits.maxWorkBytes} byte disk budget at ${outputKbps} kbps`,
                            );
                        }
                        return seconds;
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
                await removeWorkDir(workDir);
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
