/** Why a job attempt failed, as a fixed class. */
export type FailedReason =
    | "timeout"
    | "storage"
    | "db"
    | "not_enough_storage"
    | "bad_input"
    | "http_status"
    | "connection_failed"
    | "blocked_address"
    | "cancelled"
    | "internal"
    // Video jobs refused by MediaLit's limits or the tenant's file.
    | "out_of_processing_minutes"
    | "source_too_long"
    | "source_too_large"
    | "no_video_stream";

/**
 * Thrown by a handler to say how its job failed. Any other error counts as
 * a retryable `internal` failure.
 */
export class JobError extends Error {
    readonly reason: FailedReason;
    readonly retryable: boolean;
    /** Stored in `jobs.result`, for example a webhook's status code. */
    readonly result?: unknown;

    constructor(
        message: string,
        options: { reason: FailedReason; retryable: boolean; result?: unknown },
    ) {
        super(message);
        this.name = "JobError";
        this.reason = options.reason;
        this.retryable = options.retryable;
        this.result = options.result;
    }
}

/** A failure that another attempt can't fix, such as bad input. */
export function permanentError(
    message: string,
    reason: FailedReason = "bad_input",
    result?: unknown,
): JobError {
    return new JobError(message, { reason, retryable: false, result });
}

export function retryableError(
    message: string,
    reason: FailedReason = "internal",
    result?: unknown,
): JobError {
    return new JobError(message, { reason, retryable: true, result });
}

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/** A short error message with URLs removed, safe to store and log. */
export function describeError(error: unknown, max = 500): string {
    const message =
        error instanceof Error ? error.message : String(error ?? "error");
    const clean = message.replace(URL_PATTERN, "[url]");
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
