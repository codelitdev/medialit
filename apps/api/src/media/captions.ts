/**
 * The captions job (pipelines-phase-2.md, D2): turns the speech in a video
 * or audio upload into WebVTT captions and a transcript.
 *
 * 1. Refuses sources over `VIDEO_MAX_SOURCE_BYTES` before downloading.
 * 2. Downloads the original and probes it: no audio stream, or longer than
 *    `CAPTIONS_MAX_DURATION_SECONDS`, fails for good.
 * 3. Reserves processing minutes for the whole duration (D7).
 * 4. Extracts the first audio stream to 16 kHz mono WAV with ffmpeg.
 * 5. Runs the transcriber on the whole file.
 * 6. Writes `captions/captions.vtt`, `transcript.txt` and `transcript.json`.
 *
 * Retry rules: limits, ffmpeg refusing the file and the timeout fail for
 * good. The transcriber crashing or being killed, the worker stopping, and
 * storage and database errors are retried. Minutes are released when the
 * job fails for good. Captions are a background derivative: whatever
 * happens here, the media's status doesn't change (D8).
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { ProcessLimitError, runLimited } from "@medialit/images";
import { fillMediaMetadata, getDb } from "@/db";
import { cloudBucket } from "../config/constants";
import { numberFromEnv } from "../config/env";
import { downloadObject, headObject, putObject } from "../services/s3";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { resolveAccountPlan } from "../billing/entitlements";
import {
    minutesFor,
    releaseMinutes,
    reserveMinutes,
} from "../billing/processing-minutes";
import { JobError, describeError, permanentError } from "../jobs/errors";
import { transcriberFromEnv, type Transcriber } from "../transcription";
import { derivativeJob } from "./derivatives";
import { makeWorkDir, removeWorkDir } from "./work-files";
import { originalLocation } from "./poster";
import { probeMedia, type ProbeResult } from "./probe";
import { localInput } from "./h264";
import { videoLimits } from "./video-job";
import {
    CAPTION_FILES,
    CAPTIONS_ATTEMPTS,
    CAPTIONS_JOB_TYPE,
    CAPTIONS_KEY,
} from "./processing-plan";
import {
    buildCues,
    cleanSegments,
    toTranscriptJson,
    toTranscriptText,
    toVtt,
} from "./captions-format";

/** Limits, read on each job so tests can change them. */
export function captionsLimits() {
    const video = videoLimits();
    return {
        maxSourceBytes: video.maxSourceBytes,
        maxDurationSeconds: numberFromEnv(
            "CAPTIONS_MAX_DURATION_SECONDS",
            7200,
        ),
        /** For ffmpeg's extraction, as for the encodes. */
        maxMemoryMb: video.maxMemoryMb,
    };
}

/** How long one captions job may take: three times the audio, at least
 * 15 min (D2). Covers the slowest language measured with room to spare. */
export function captionsTimeoutMs(durationSeconds: number): number {
    return Math.max(15 * 60 * 1000, 3 * durationSeconds * 1000);
}

/** The job type's own timeout: the longest a job may take, plus time for
 * the download and the upload. The job enforces the real limit. */
export function captionsJobTimeoutMs(): number {
    return (
        captionsTimeoutMs(captionsLimits().maxDurationSeconds) + 30 * 60 * 1000
    );
}

/** ffmpeg's arguments for 16 kHz mono 16-bit PCM from the first audio
 * stream, no longer than `maxDurationSeconds`. */
export function extractAudioArgs(input: {
    source: string;
    output: string;
    maxDurationSeconds: number;
}): string[] {
    return [
        ...localInput(input.source, 1),
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-t",
        String(input.maxDurationSeconds),
        "-f",
        "wav",
        input.output,
    ];
}

type CpuTimes = { steal: number; total: number };

/** The node's CPU time so far, from /proc/stat. Null where there is none. */
async function readCpuTimes(): Promise<CpuTimes | null> {
    try {
        const line = (await readFile("/proc/stat", "utf8")).split("\n")[0];
        const values = line.trim().split(/\s+/).slice(1, 9).map(Number);
        if (values.length < 8 || values.some((v) => !Number.isFinite(v))) {
            return null;
        }
        return {
            steal: values[7],
            total: values.reduce((sum, v) => sum + v, 0),
        };
    } catch {
        return null;
    }
}

/** The share of the node's CPU time stolen by the hypervisor between two
 * readings, in percent with one decimal. */
export function stealPercent(
    before: CpuTimes | null,
    after: CpuTimes | null,
): number | undefined {
    if (!before || !after) return undefined;
    const total = after.total - before.total;
    if (total <= 0) return undefined;
    return Math.round(((after.steal - before.steal) / total) * 1000) / 10;
}

type Stage = "extract" | "transcribe" | "other";

/** Marks where a process failed, so the retry rules can tell ffmpeg
 * refusing the file from the transcriber crashing. */
class StageError extends Error {
    constructor(
        readonly stage: Stage,
        readonly cause: unknown,
    ) {
        super(describeError(cause));
    }
}

function refuse(
    code: "source_too_large" | "source_too_long" | "no_audio_stream",
    detail: string,
): JobError {
    return permanentError(`${code}: ${detail}`, code);
}

/** Uploads one output file and returns its size. */
async function uploadFile(
    privateFolder: string,
    name: string,
    body: string,
    contentType: string,
): Promise<number> {
    const bytes = Buffer.from(body, "utf8");
    await putObject({
        Key: `${privateFolder}${CAPTIONS_KEY}${name}`,
        Body: bytes,
        ContentType: contentType,
        Bucket: cloudBucket,
    });
    return bytes.length;
}

export function captionsJob(
    transcriber: () => Transcriber = () => transcriberFromEnv(),
) {
    return derivativeJob({
        type: CAPTIONS_JOB_TYPE,
        name: "captions",
        class: "transcribe",
        maxAttempts: CAPTIONS_ATTEMPTS,
        timeoutMs: captionsJobTimeoutMs(),
        produce: async (context) => {
            const startedAt = Date.now();
            const { media, job } = context;
            const sourceKind =
                context.params.source === "audio_upload"
                    ? "audio_upload"
                    : "video";
            const fields = {
                media_id: media.mediaId,
                app_id: media.appId,
                job_id: job.id,
            };
            const limits = captionsLimits();
            const engine = transcriber();
            let probe: ProbeResult | null = null;
            let reserved = false;
            const workDir = await makeWorkDir("captions");
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
                        `the file is ${bytes} bytes, over the ${limits.maxSourceBytes} byte limit`,
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
                if (!probe || !probe.details.hasAudio) {
                    throw refuse(
                        "no_audio_stream",
                        "the file has no audio that can be read",
                    );
                }
                await fillMediaMetadata(getDb(), media.id, probe.metadata);
                const duration = probe.metadata.durationSeconds ?? 0;
                if (duration > limits.maxDurationSeconds) {
                    throw refuse(
                        "source_too_long",
                        `the file is ${Math.round(duration)} s long, over the ${limits.maxDurationSeconds} s limit`,
                    );
                }
                // A header that understates the length makes this shorter,
                // never longer.
                const deadline = startedAt + captionsTimeoutMs(duration);

                // Minutes (D7): the whole duration, silence included.
                const plan = await resolveAccountPlan({ id: media.userId });
                const reservation = await reserveMinutes({
                    userId: media.userId,
                    appId: media.appId,
                    mediaRowId: media.id,
                    jobId: job.id,
                    kind: "captions",
                    minutes: minutesFor(duration),
                    plan,
                });
                if (!reservation.ok) {
                    throw permanentError(
                        `out_of_processing_minutes: the file needs ${reservation.needed} minutes and ${reservation.allowed - reservation.used} of ${reservation.allowed} are left this month`,
                        "out_of_processing_minutes",
                    );
                }
                reserved = reservation.charged > 0;

                const wav = path.join(workDir, "audio.wav");
                await runLimited(
                    "ffmpeg",
                    extractAudioArgs({
                        source,
                        output: wav,
                        maxDurationSeconds: limits.maxDurationSeconds,
                    }),
                    {
                        timeoutMs: Math.max(1000, deadline - Date.now()),
                        memoryMb: limits.maxMemoryMb,
                        signal: context.signal,
                    },
                ).catch((err: unknown) => {
                    throw new StageError("extract", err);
                });

                const transcribeStarted = Date.now();
                const cpuBefore = await readCpuTimes();
                const result = await engine
                    .transcribe({
                        wavPath: wav,
                        outPath: path.join(workDir, "transcript.out.json"),
                        timeoutMs: Math.max(1000, deadline - Date.now()),
                        signal: context.signal,
                    })
                    .catch((err: unknown) => {
                        throw new StageError("transcribe", err);
                    });
                const transcribeMs = Date.now() - transcribeStarted;
                const cpuStealPct = stealPercent(
                    cpuBefore,
                    await readCpuTimes(),
                );

                const segments = cleanSegments(result.segments);
                const cues = buildCues(segments);
                const language = result.language.toLowerCase().slice(0, 8);
                const size =
                    (await uploadFile(
                        context.privateFolder,
                        CAPTION_FILES.vtt,
                        toVtt(cues),
                        "text/vtt; charset=utf-8",
                    )) +
                    (await uploadFile(
                        context.privateFolder,
                        CAPTION_FILES.text,
                        toTranscriptText(segments),
                        "text/plain; charset=utf-8",
                    )) +
                    (await uploadFile(
                        context.privateFolder,
                        CAPTION_FILES.json,
                        toTranscriptJson({
                            language,
                            durationSeconds: duration,
                            model: engine.model,
                            segments,
                        }),
                        "application/json",
                    ));

                const speed =
                    transcribeMs > 0
                        ? Math.round((duration / (transcribeMs / 1000)) * 100) /
                          100
                        : undefined;
                const summary = {
                    ...fields,
                    source_kind: sourceKind,
                    language,
                    model: engine.model,
                    source_duration_s: duration,
                    cues: cues.length,
                    duration_ms: Date.now() - startedAt,
                    load_ms: result.loadMs,
                    speed,
                    ...(cpuStealPct !== undefined
                        ? { cpu_steal_pct: cpuStealPct }
                        : {}),
                    minutes_charged: reservation.charged,
                };
                logger.info(summary, "captions made");
                trackEvent({
                    event: "captions.made",
                    source: CAPTIONS_JOB_TYPE,
                    appId: media.appId,
                    userId: media.userId,
                    properties: summary,
                });
                return {
                    key: CAPTIONS_KEY,
                    size,
                    params: {
                        language,
                        model: engine.model,
                        ...(speed !== undefined ? { speed } : {}),
                        ...(cpuStealPct !== undefined ? { cpuStealPct } : {}),
                    },
                };
            } catch (err) {
                const failure = classify(err, context.signal);
                if (err instanceof StageError && err.stage === "transcribe") {
                    const cause = err.cause;
                    logger.warn(
                        {
                            ...fields,
                            attempt: job.attempts,
                            failed_reason: failure.reason,
                            ...(cause instanceof ProcessLimitError
                                ? {
                                      exit_code: cause.exit.code ?? undefined,
                                      signal: cause.exit.signal ?? undefined,
                                  }
                                : {}),
                        },
                        "transcriber failed",
                    );
                }
                const lastAttempt = job.attempts >= job.maxAttempts;
                if (!failure.retryable || lastAttempt) {
                    if (reserved) {
                        await releaseMinutes(job.id, failure.reason).catch(
                            () => 0,
                        );
                    }
                    trackEvent({
                        event: "captions.failed",
                        source: CAPTIONS_JOB_TYPE,
                        appId: media.appId,
                        userId: media.userId,
                        properties: {
                            ...fields,
                            failed_reason: failure.reason,
                            attempt: job.attempts,
                            ...(probe?.metadata.durationSeconds
                                ? {
                                      source_duration_s:
                                          probe.metadata.durationSeconds,
                                  }
                                : {}),
                        },
                    });
                }
                throw failure;
            } finally {
                await removeWorkDir(workDir);
            }
        },
    });
}

/** Turns a failure into a job error with the retry rules above. */
export function classify(err: unknown, signal: AbortSignal): JobError {
    if (err instanceof JobError) return err;
    const stage = err instanceof StageError ? err.stage : "other";
    const cause = err instanceof StageError ? err.cause : err;
    if (cause instanceof ProcessLimitError) {
        if (cause.reason === "timeout") {
            return permanentError(describeError(cause), "timeout");
        }
        if (cause.reason === "aborted" || signal.aborted) {
            return new JobError(describeError(cause), {
                reason: "cancelled",
                retryable: true,
            });
        }
        // ffmpeg exiting with an error on our local copy: the file. Killed
        // by a signal: maybe the worker, not the file.
        if (stage === "extract" && !cause.exit.signal) {
            return permanentError(describeError(cause), "bad_input");
        }
        return new JobError(describeError(cause), {
            reason: "internal",
            retryable: true,
        });
    }
    if (stage !== "other" || signal.aborted) {
        // The transcriber's output was unreadable, or it threw.
        return new JobError(describeError(cause), {
            reason: signal.aborted ? "cancelled" : "internal",
            retryable: true,
        });
    }
    return new JobError(describeError(cause), {
        reason: "storage",
        retryable: true,
    });
}

export const captionsJobDefinition = captionsJob();
