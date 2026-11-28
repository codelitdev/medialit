/**
 * The exceptions the worker raises. Log
 * lines for each job state change come from the runner itself.
 */
import type { FailedReason } from "./errors";
import type { ReapedJob, JobRow } from "./queue";
import type { RunnerOptions } from "./runner";
import { WEBHOOK_DELIVER_JOB } from "../webhooks/queries";

type Severity = "error" | "warning" | "critical";

export type CaptureException = (input: {
    error: unknown;
    source: string;
    subjectId?: unknown;
    context?: Record<string, unknown>;
    severity?: Severity;
}) => void;

/** Work outside an app or account (the cleanup jobs, alerts) reports as
 * `system`. */
export const SYSTEM_SUBJECT = "system";

/** A tenant's failing webhook endpoint is theirs to fix, and shows in their
 * dashboard, so it raises no exception. */
const NOT_REPORTED = new Set([WEBHOOK_DELIVER_JOB]);

/** Jobs that read a tenant's video. ffmpeg refusing the file is the file's
 * problem there, so `bad_input` raises no exception for them. */
const VIDEO_JOB_TYPES = new Set([
    "media.poster",
    "media.mp4",
    "media.hls",
    "media.captions",
]);

/** Failures caused by the tenant's input or MediaLit's limits. They are
 * logged and shown on the media, and raise no exception. */
const TENANT_REASONS = new Set<FailedReason>([
    "bad_input",
    "out_of_processing_minutes",
    "source_too_long",
    "source_too_large",
    "no_video_stream",
    "no_audio_stream",
]);

/** Failures that point at MediaLit itself rather than at one job's input. */
const CRITICAL_REASONS = new Set<FailedReason>(["db", "storage", "internal"]);

export function failureSeverity(reason: FailedReason): Severity {
    return CRITICAL_REASONS.has(reason) ? "critical" : "error";
}

export function jobTelemetryHooks(
    capture: CaptureException,
): Pick<RunnerOptions, "onJobFailed" | "onReaped" | "onRunnerError"> {
    return {
        onJobFailed({ job, reason, error }) {
            if (NOT_REPORTED.has(job.type)) return;
            // The tenant's file or our limits, not ours to fix.
            if (
                TENANT_REASONS.has(reason) &&
                (reason !== "bad_input" || VIDEO_JOB_TYPES.has(job.type))
            ) {
                return;
            }
            capture({
                error: new Error(error),
                source: `worker.${job.type}.failed`,
                subjectId: job.appId ?? SYSTEM_SUBJECT,
                severity: failureSeverity(reason),
                context: jobContext(job, reason),
            });
        },
        onReaped(jobs) {
            const byType = new Map<string, ReapedJob[]>();
            for (const job of jobs) {
                byType.set(job.type, [...(byType.get(job.type) ?? []), job]);
            }
            for (const [type, reaped] of byType) {
                const first = reaped[0];
                capture({
                    error: new Error("job lease expired"),
                    source: `worker.${type}.reaped`,
                    subjectId:
                        reaped.length === 1 && first.appId
                            ? first.appId
                            : SYSTEM_SUBJECT,
                    severity: "warning",
                    context: {
                        job_type: type,
                        count: reaped.length,
                        ...(reaped.length === 1
                            ? {
                                  job_id: first.id,
                                  attempts_made: first.attempts,
                              }
                            : {}),
                    },
                });
            }
        },
        onRunnerError(error, step) {
            capture({
                error,
                source: "worker.error",
                subjectId: SYSTEM_SUBJECT,
                severity: "error",
                context: { reason: step },
            });
        },
    };
}

function jobContext(job: JobRow, reason: FailedReason) {
    return {
        job_id: job.id,
        job_type: job.type,
        attempts_made: job.attempts,
        failed_reason: reason,
        ...(job.mediaId ? { media_id: job.mediaId } : {}),
        ...(job.appId ? { app_id: job.appId } : {}),
    };
}
