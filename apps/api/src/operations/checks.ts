/**
 * What the alert checks look for. The
 * worker that holds the alerts lock checks the queue. The API checks what
 * only it can see: that no worker is running, and WebP skipped at seal.
 */
import { sql } from "drizzle-orm";
import type { Executor } from "../jobs/queue";
import { missingWorkerClasses, WORKER_SEEN_WITHIN_MS } from "../jobs/runner";
import { WEBHOOK_DELIVER_JOB } from "../webhooks/queries";
import { CAPTIONS_JOB_TYPE } from "../media/processing-plan";
import type { Alert } from "./alerts";

/** The advisory lock that picks the one worker running the queue checks. */
export const ALERTS_LOCK = "medialit.operations.alerts";

export const QUEUE_LAG_MS = 10 * 60 * 1000;
/** Video encodes take an hour or two each, one at a time, so a video job
 * waits far longer than others before something is wrong. */
export const VIDEO_QUEUE_LAG_MS = 6 * 60 * 60 * 1000;
/** Captions wait behind one transcription at a time (pipelines-phase-2.md,
 * D5), so they get the video jobs' patience. */
export const TRANSCRIBE_QUEUE_LAG_MS = 6 * 60 * 60 * 1000;
/** Job types of the `transcribe` class. Named here rather than read from
 * the worker's definitions: every worker checks the queue, and only
 * transcription workers load the captions job. */
const TRANSCRIBE_JOB_TYPES = [CAPTIONS_JOB_TYPE];
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;
/** More failures than this within the window page. */
export const FAILURE_SPIKE = 10;
export const WEBP_BUSY_WINDOW_MS = 10 * 60 * 1000;

/** Failures that are a tenant's to fix (their webhook endpoint is down) and
 * don't count toward a spike. */
const TENANT_JOB_TYPES = [WEBHOOK_DELIVER_JOB];

export async function collectWorkerAlerts(
    db: Executor,
    options: {
        /** Job types of the `video` class, timed by `VIDEO_QUEUE_LAG_MS`. */
        videoJobTypes?: readonly string[];
    } = {},
): Promise<Alert[]> {
    const tenantTypes = sql.join(
        TENANT_JOB_TYPES.map((type) => sql`${type}`),
        sql`, `,
    );
    // Lists that are never empty, so NOT IN and IN stay valid SQL.
    const videoTypes = sql.join(
        ["", ...(options.videoJobTypes ?? [])].map((type) => sql`${type}`),
        sql`, `,
    );
    const transcribeTypes = sql.join(
        TRANSCRIBE_JOB_TYPES.map((type) => sql`${type}`),
        sql`, `,
    );
    const result = await db.execute(
        sql`SELECT
                (SELECT floor(extract(epoch FROM now() - min(run_at)) * 1000)
                    FROM jobs WHERE status = 'queued' AND run_at <= now()
                    AND type NOT IN (${videoTypes})
                    AND type NOT IN (${transcribeTypes})) AS "lagMs",
                (SELECT floor(extract(epoch FROM now() - min(run_at)) * 1000)
                    FROM jobs WHERE status = 'queued' AND run_at <= now()
                    AND type IN (${videoTypes})) AS "videoLagMs",
                (SELECT floor(extract(epoch FROM now() - min(run_at)) * 1000)
                    FROM jobs WHERE status = 'queued' AND run_at <= now()
                    AND type IN (${transcribeTypes})) AS "transcribeLagMs",
                (SELECT count(*) FROM jobs
                    WHERE status = 'failed'
                    AND finished_at > now() - (${FAILURE_WINDOW_MS} * interval '1 millisecond')
                    AND type NOT IN (${tenantTypes})) AS "failed"`,
    );
    const row = result.rows[0] as {
        lagMs: string | number | null;
        videoLagMs: string | number | null;
        transcribeLagMs: string | number | null;
        failed: string | number;
    };
    const alerts: Alert[] = [];
    const lagMs = row.lagMs === null ? 0 : Number(row.lagMs);
    if (lagMs > QUEUE_LAG_MS) {
        alerts.push({
            code: "jobs_queue_lag",
            message:
                "A queued job has waited more than 10 minutes. Workers are down, stuck or too few.",
            details: { age_ms: lagMs },
        });
    }
    const videoLagMs = row.videoLagMs === null ? 0 : Number(row.videoLagMs);
    if (videoLagMs > VIDEO_QUEUE_LAG_MS) {
        alerts.push({
            code: "video_queue_lag",
            message:
                "A video job has waited more than 6 hours. The video worker is down, stuck or too slow.",
            details: { age_ms: videoLagMs },
        });
    }
    const transcribeLagMs =
        row.transcribeLagMs === null ? 0 : Number(row.transcribeLagMs);
    if (transcribeLagMs > TRANSCRIBE_QUEUE_LAG_MS) {
        alerts.push({
            code: "transcribe_queue_lag",
            message:
                "A captions job has waited more than 6 hours. The transcription worker is down, stuck or too slow; consider a dedicated node.",
            details: { age_ms: transcribeLagMs },
        });
    }
    const failed = Number(row.failed);
    if (failed > FAILURE_SPIKE) {
        alerts.push({
            code: "jobs_failure_spike",
            message: `${failed} jobs failed for good in the last 10 minutes.`,
            details: { count: failed },
        });
    }
    return alerts;
}

/** Times seal skipped WebP for lack of a free conversion slot, in this
 * process. Seal calls `recordWebpBusy` (#262). */
const webpBusyAt: number[] = [];

export function recordWebpBusy(now = Date.now()): void {
    webpBusyAt.push(now);
    trimWebpBusy(now);
}

function trimWebpBusy(now: number) {
    const cutoff = now - WEBP_BUSY_WINDOW_MS;
    while (webpBusyAt.length > 0 && webpBusyAt[0] < cutoff) webpBusyAt.shift();
}

export function resetWebpBusyForTests(): void {
    webpBusyAt.length = 0;
}

type WarnLogger = {
    warn: (context: Record<string, unknown>, message: string) => void;
};

export const NO_WORKER_WARNING =
    "No MediaLit worker is running, so uploads are not cleaned up. Start the medialit-worker service (bun apps/api/src/worker.ts).";

/**
 * The API's checks. A job class with no worker seen in 5 minutes pages
 * `jobs_no_worker`, and also logs a warning at most once an hour for
 * installs that don't set OPERATOR_ALERT_EMAIL.
 */
export function apiAlertCheck(input: {
    db: Executor;
    logger: WarnLogger;
    now?: () => number;
}): () => Promise<Alert[]> {
    const now = input.now ?? Date.now;
    // A worker started with the API has five minutes to show up before a page.
    const startedAt = now();
    let lastWarnedAt: number | undefined;
    return async () => {
        const alerts: Alert[] = [];
        const missing = await missingWorkerClasses(input.db, {
            transcribe: [CAPTIONS_JOB_TYPE],
        });
        if (missing.length > 0) {
            const at = now();
            if (
                lastWarnedAt === undefined ||
                at - lastWarnedAt >= 60 * 60 * 1000
            ) {
                lastWarnedAt = at;
                input.logger.warn(
                    { reason: missing.join(",") },
                    NO_WORKER_WARNING,
                );
            }
            if (at - startedAt >= WORKER_SEEN_WITHIN_MS) {
                alerts.push({
                    code: "jobs_no_worker",
                    message: `No worker has run ${missing.join(" or ")} jobs for 5 minutes. ${noWorkerConsequence(missing)}`,
                    details: { reason: missing.join(",") },
                });
            }
        } else {
            lastWarnedAt = undefined;
        }
        trimWebpBusy(now());
        if (webpBusyAt.length > 0) {
            alerts.push({
                code: "webp_busy",
                message: `Seal skipped WebP ${webpBusyAt.length} times in the last 10 minutes because every conversion slot was busy.`,
                details: { count: webpBusyAt.length },
            });
        }
        return alerts;
    };
}

/** What stops working without a worker for these classes. */
function noWorkerConsequence(missing: readonly string[]): string {
    const effects: string[] = [];
    if (missing.includes("io") || missing.includes("cpu")) {
        effects.push("Uploads are not cleaned up and posters are not made.");
    }
    if (missing.includes("video")) {
        effects.push("Videos are not encoded.");
    }
    if (missing.includes("transcribe")) {
        effects.push(
            "Captions are not made. Start the medialit-transcribe worker (WORKER_CLASSES=transcribe).",
        );
    }
    return effects.join(" ");
}
