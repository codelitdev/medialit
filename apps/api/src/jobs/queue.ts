/**
 * The job queue's SQL (docs/prds/pipelines-phase-0.md, D1 and section 5).
 * It knows nothing about media: job types and payloads come from the caller.
 * Every function takes the database or a transaction, so a job can be queued
 * in the same transaction as the change that needs it.
 */
import { uuidv7 } from "@codelitdev/platform";
import { sql, type SQL } from "drizzle-orm";
import type { AppDb } from "../db/client";
import type { JobStatus } from "../db/schema/domain";

/** The database or a transaction. */
export type Executor = Pick<AppDb, "execute">;

export const JOBS_CHANNEL = "jobs";

export type JobRow = {
    id: string;
    type: string;
    payload: unknown;
    mediaId: string | null;
    appId: string | null;
    status: JobStatus;
    priority: number;
    runAt: Date;
    attempts: number;
    maxAttempts: number;
    lockedBy: string | null;
    lockedUntil: Date | null;
    lastError: string | null;
    result: unknown;
    dedupeKey: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
};

const COLUMNS = sql.raw(
    [
        "id",
        "type",
        "payload",
        `media_id AS "mediaId"`,
        `app_id AS "appId"`,
        "status",
        "priority",
        `run_at AS "runAt"`,
        "attempts",
        `max_attempts AS "maxAttempts"`,
        `locked_by AS "lockedBy"`,
        `locked_until AS "lockedUntil"`,
        `last_error AS "lastError"`,
        "result",
        `dedupe_key AS "dedupeKey"`,
        `created_at AS "createdAt"`,
        `started_at AS "startedAt"`,
        `finished_at AS "finishedAt"`,
    ].join(", "),
);

export async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
    const result = await db.execute(query);
    return result.rows as T[];
}

const DATE_FIELDS = [
    "runAt",
    "lockedUntil",
    "createdAt",
    "startedAt",
    "finishedAt",
] as const;

/** Drizzle's `execute` returns timestamps as strings. */
async function jobRows(db: Executor, query: SQL): Promise<JobRow[]> {
    const found = await rows<Record<string, unknown>>(db, query);
    return found.map((row) => {
        for (const field of DATE_FIELDS) {
            const value = row[field];
            if (
                value !== null &&
                value !== undefined &&
                !(value instanceof Date)
            ) {
                row[field] = new Date(value as string);
            }
        }
        return row as JobRow;
    });
}

/** A duration as a Postgres interval. */
export function ms(value: number): SQL {
    return sql`(${Math.max(0, Math.round(value))} * interval '1 millisecond')`;
}

export type EnqueueInput = {
    type: string;
    payload: unknown;
    maxAttempts: number;
    mediaId?: string | null;
    appId?: string | null;
    priority?: number;
    /** Delay before the job may run. */
    delayMs?: number;
    /** No new job is queued while one with this key is queued or running. */
    dedupeKey?: string;
};

/**
 * Queues a job and wakes the workers when the transaction commits. Returns
 * the new job's ID, or null when `dedupeKey` matched a queued or running job.
 */
export async function enqueue(
    db: Executor,
    input: EnqueueInput,
): Promise<string | null> {
    const id = uuidv7();
    const inserted = await rows<{ id: string }>(
        db,
        sql`INSERT INTO jobs (id, type, payload, media_id, app_id, status, priority, run_at, max_attempts, dedupe_key)
            VALUES (${id}, ${input.type}, ${JSON.stringify(input.payload ?? {})}::jsonb,
                ${input.mediaId ?? null}, ${input.appId ?? null}, 'queued',
                ${input.priority ?? 100}, now() + ${ms(input.delayMs ?? 0)},
                ${input.maxAttempts}, ${input.dedupeKey ?? null})
            ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO NOTHING
            RETURNING id`,
    );
    if (inserted.length === 0) return null;
    await db.execute(sql`SELECT pg_notify(${JOBS_CHANNEL}, ${input.type})`);
    return id;
}

/**
 * Queues a periodic job unless one is already queued or running. It runs
 * `everyMs` after the last run of its type finished, or now if none has.
 */
export async function schedulePeriodic(
    db: Executor,
    input: { type: string; everyMs: number },
): Promise<boolean> {
    const inserted = await rows<{ id: string }>(
        db,
        sql`INSERT INTO jobs (id, type, payload, status, run_at, max_attempts, dedupe_key)
            SELECT ${uuidv7()}, ${input.type}, '{}'::jsonb, 'queued',
                greatest(now(), coalesce(
                    (SELECT max(finished_at) FROM jobs WHERE type = ${input.type}) + ${ms(input.everyMs)},
                    now())),
                1, ${`periodic:${input.type}`}
            ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO NOTHING
            RETURNING id`,
    );
    return inserted.length > 0;
}

/**
 * Claims up to `limit` due jobs of the given types, highest priority (lowest
 * number) first, and leases them to `workerId`.
 */
export async function claim(
    db: Executor,
    input: {
        types: readonly string[];
        limit: number;
        workerId: string;
        leaseMs: number;
    },
): Promise<JobRow[]> {
    if (input.limit <= 0 || input.types.length === 0) return [];
    const types = sql.join(
        input.types.map((type) => sql`${type}`),
        sql`, `,
    );
    return jobRows(
        db,
        sql`UPDATE jobs SET status = 'running', locked_by = ${input.workerId},
                locked_until = now() + ${ms(input.leaseMs)},
                attempts = attempts + 1, started_at = now()
            WHERE id IN (
                SELECT id FROM jobs
                WHERE status = 'queued' AND type IN (${types}) AND run_at <= now()
                ORDER BY priority, run_at
                LIMIT ${input.limit}
                FOR UPDATE SKIP LOCKED)
            RETURNING ${COLUMNS}`,
    );
}

/**
 * Extends the leases of jobs this worker still runs. Returns the IDs it
 * extended: a missing ID was cancelled, deleted or taken by the reaper.
 */
export async function heartbeat(
    db: Executor,
    input: { workerId: string; ids: readonly string[]; leaseMs: number },
): Promise<Set<string>> {
    if (input.ids.length === 0) return new Set();
    const ids = sql.join(
        input.ids.map((id) => sql`${id}`),
        sql`, `,
    );
    const updated = await rows<{ id: string }>(
        db,
        sql`UPDATE jobs SET locked_until = now() + ${ms(input.leaseMs)}
            WHERE id IN (${ids}) AND status = 'running' AND locked_by = ${input.workerId}
            RETURNING id`,
    );
    return new Set(updated.map((row) => row.id));
}

/** Marks a job this worker runs as succeeded. False if it no longer owns it. */
export async function complete(
    db: Executor,
    input: { id: string; workerId: string; result?: unknown },
): Promise<boolean> {
    const updated = await rows<{ id: string }>(
        db,
        sql`UPDATE jobs SET status = 'succeeded', finished_at = now(),
                locked_by = NULL, locked_until = NULL, last_error = NULL,
                result = ${input.result === undefined ? null : JSON.stringify(input.result)}::jsonb
            WHERE id = ${input.id} AND status = 'running' AND locked_by = ${input.workerId}
            RETURNING id`,
    );
    return updated.length > 0;
}

export type FailOutcome = "retry" | "failed" | "lost";

/**
 * Records a failed attempt. A retryable failure with attempts left queues
 * the job again after `retryInMs`; anything else fails it for good. "lost"
 * means this worker no longer owned the job.
 */
export async function fail(
    db: Executor,
    input: {
        id: string;
        workerId: string;
        error: string;
        retryable: boolean;
        retryInMs: number;
        result?: unknown;
    },
): Promise<FailOutcome> {
    const result =
        input.result === undefined ? null : JSON.stringify(input.result);
    const updated = await rows<{ status: JobStatus }>(
        db,
        sql`UPDATE jobs SET
                status = CASE WHEN ${input.retryable} AND attempts < max_attempts
                    THEN 'queued' ELSE 'failed' END,
                run_at = CASE WHEN ${input.retryable} AND attempts < max_attempts
                    THEN now() + ${ms(input.retryInMs)} ELSE run_at END,
                finished_at = CASE WHEN ${input.retryable} AND attempts < max_attempts
                    THEN NULL ELSE now() END,
                locked_by = NULL, locked_until = NULL,
                last_error = ${input.error}, result = ${result}::jsonb
            WHERE id = ${input.id} AND status = 'running' AND locked_by = ${input.workerId}
            RETURNING status`,
    );
    if (updated.length === 0) return "lost";
    return updated[0].status === "queued" ? "retry" : "failed";
}

/**
 * Gives jobs back to the queue without counting the attempt, for a worker
 * that is shutting down.
 */
export async function release(
    db: Executor,
    input: { workerId: string; ids: readonly string[] },
): Promise<number> {
    if (input.ids.length === 0) return 0;
    const ids = sql.join(
        input.ids.map((id) => sql`${id}`),
        sql`, `,
    );
    const updated = await rows<{ id: string }>(
        db,
        sql`UPDATE jobs SET status = 'queued', locked_by = NULL, locked_until = NULL,
                attempts = greatest(attempts - 1, 0), started_at = NULL
            WHERE id IN (${ids}) AND status = 'running' AND locked_by = ${input.workerId}
            RETURNING id`,
    );
    if (updated.length > 0) {
        await db.execute(sql`SELECT pg_notify(${JOBS_CHANNEL}, 'released')`);
    }
    return updated.length;
}

export type ReapedJob = {
    id: string;
    type: string;
    mediaId: string | null;
    appId: string | null;
    attempts: number;
    lockedBy: string | null;
    status: JobStatus;
};

/**
 * Takes back running jobs whose lease has expired (their worker died or
 * hung): queues them again, or fails them once they have used every attempt.
 */
export async function reap(db: Executor): Promise<ReapedJob[]> {
    return rows<ReapedJob>(
        db,
        sql`WITH expired AS (
                SELECT id, locked_by FROM jobs
                WHERE status = 'running' AND locked_until < now()
                FOR UPDATE SKIP LOCKED)
            UPDATE jobs SET
                status = CASE WHEN jobs.attempts < jobs.max_attempts THEN 'queued' ELSE 'failed' END,
                finished_at = CASE WHEN jobs.attempts < jobs.max_attempts THEN NULL ELSE now() END,
                last_error = 'lease expired', locked_by = NULL, locked_until = NULL
            FROM expired WHERE jobs.id = expired.id
            RETURNING jobs.id, jobs.type, jobs.media_id AS "mediaId",
                jobs.app_id AS "appId", jobs.attempts,
                expired.locked_by AS "lockedBy", jobs.status`,
    );
}

/**
 * Cancels queued and running jobs that match. A worker running one aborts
 * it at its next heartbeat.
 */
export async function cancel(
    db: Executor,
    where: {
        appId?: string;
        mediaId?: string;
        id?: string;
        type?: string;
        /** Only jobs created within this many milliseconds. */
        sinceMs?: number;
    },
): Promise<number> {
    const conditions: SQL[] = [];
    if (where.appId) conditions.push(sql`app_id = ${where.appId}`);
    if (where.mediaId) conditions.push(sql`media_id = ${where.mediaId}`);
    if (where.id) conditions.push(sql`id = ${where.id}`);
    if (where.type) conditions.push(sql`type = ${where.type}`);
    if (where.sinceMs !== undefined) {
        conditions.push(sql`created_at > now() - ${ms(where.sinceMs)}`);
    }
    if (conditions.length === 0) {
        throw new Error("cancel needs a filter");
    }
    const updated = await rows<{ id: string }>(
        db,
        sql`UPDATE jobs SET status = 'cancelled', finished_at = now(),
                locked_by = NULL, locked_until = NULL
            WHERE status IN ('queued', 'running') AND ${sql.join(conditions, sql` AND `)}
            RETURNING id`,
    );
    return updated.length;
}

export const SUCCEEDED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const WORKER_ROW_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes finished and cancelled jobs after 7 days, failed ones after 30,
 * and `workers` rows not seen for a day.
 */
export async function prune(
    db: Executor,
): Promise<{ jobs: number; workers: number }> {
    const deleted = await rows<{ id: string }>(
        db,
        sql`DELETE FROM jobs WHERE
                (status IN ('succeeded', 'cancelled') AND finished_at < now() - ${ms(SUCCEEDED_RETENTION_MS)})
             OR (status = 'failed' AND finished_at < now() - ${ms(FAILED_RETENTION_MS)})
            RETURNING id`,
    );
    const gone = await rows<{ id: string }>(
        db,
        sql`DELETE FROM workers WHERE last_seen_at < now() - ${ms(WORKER_ROW_RETENTION_MS)}
            RETURNING id`,
    );
    return { jobs: deleted.length, workers: gone.length };
}

export async function getJob(db: Executor, id: string): Promise<JobRow | null> {
    const found = await jobRows(
        db,
        sql`SELECT ${COLUMNS} FROM jobs WHERE id = ${id}`,
    );
    return found[0] ?? null;
}

export async function recordWorker(
    db: Executor,
    input: { id: string; classes: readonly string[] },
): Promise<void> {
    const classes = sql`ARRAY[${sql.join(
        input.classes.map((c) => sql`${c}`),
        sql`, `,
    )}]::text[]`;
    await db.execute(
        sql`INSERT INTO workers (id, classes, started_at, last_seen_at)
            VALUES (${input.id}, ${classes}, now(), now())
            ON CONFLICT (id) DO UPDATE SET last_seen_at = now(), classes = EXCLUDED.classes`,
    );
}

/** Job classes with a worker seen within `withinMs`. */
/** True when any job of these types is queued. */
export async function hasQueuedJobs(
    db: Executor,
    types: readonly string[],
): Promise<boolean> {
    if (types.length === 0) return false;
    const found = await rows<{ found: number }>(
        db,
        sql`SELECT 1 AS found FROM jobs WHERE status = 'queued'
            AND type IN (${sql.join(
                types.map((type) => sql`${type}`),
                sql`, `,
            )}) LIMIT 1`,
    );
    return found.length > 0;
}

export async function liveWorkerClasses(
    db: Executor,
    withinMs: number,
): Promise<Set<string>> {
    const found = await rows<{ class: string }>(
        db,
        sql`SELECT DISTINCT unnest(classes) AS class FROM workers
            WHERE last_seen_at > now() - ${ms(withinMs)}`,
    );
    return new Set(found.map((row) => row.class));
}
