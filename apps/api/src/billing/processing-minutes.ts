/**
 * Processing minutes. Video encodes count the
 * source's duration, rounded up to whole minutes, once per HLS job and once
 * per MP4 re-encode. Each account has an allowance per calendar month (UTC):
 * `PROCESSING_MINUTES_FREE` on the free plan, `PROCESSING_MINUTES_PAID` on
 * the paid plan. Self-hosted installs are unlimited and record nothing.
 *
 * An encode reserves its minutes when it starts, keyed by its job, so a
 * retry doesn't charge twice. A failed encode releases them: accounts pay
 * only for output they get.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import type { AccountPlan } from "./entitlements";
import { numberFromEnv } from "../config/env";

export const DEFAULT_FREE_MINUTES = 5;
export const DEFAULT_PAID_MINUTES = 300;

/** The monthly allowance, or null for no limit (self-hosted). Read on each
 * call, so a changed setting applies without a restart in tests. */
export function minutesAllowedFor(plan: AccountPlan): number | null {
    if (plan === "oss") return null;
    const allowed =
        plan === "pro"
            ? numberFromEnv("PROCESSING_MINUTES_PAID", DEFAULT_PAID_MINUTES, {
                  allowZero: true,
              })
            : numberFromEnv("PROCESSING_MINUTES_FREE", DEFAULT_FREE_MINUTES, {
                  allowZero: true,
              });
    return Math.floor(allowed);
}

/** Whole minutes for a source of this length; at least one. */
export function minutesFor(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
    return Math.max(1, Math.ceil(durationSeconds / 60));
}

/** The start of the calendar month (UTC) that `now` falls in. */
export function monthStart(now: Date = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Marks the first refusal of a month, so `processing_minutes.exhausted` is
 * sent once per account a month. Counts zero minutes. */
const EXHAUSTED_KIND = "exhausted";

async function minutesUsedIn(
    db: Executor,
    userId: string,
    now: Date,
): Promise<number> {
    const result = await db.execute(
        sql`SELECT coalesce(sum(minutes), 0)::int AS used
            FROM processing_usage
            WHERE user_id = ${userId} AND created_at >= ${monthStart(now).toISOString()}`,
    );
    return Number((result.rows[0] as { used: number }).used);
}

export async function minutesUsed(
    userId: string,
    now: Date = new Date(),
): Promise<number> {
    return await minutesUsedIn(getDb(), userId, now);
}

/** Where the stats read this month's minutes. An object so tests without a
 * database can replace `used`, like `billingStateSource`. */
export const minutesSource = {
    used: (userId: string) => minutesUsed(userId),
};

export type MinutesSummary = {
    used: number;
    /** Null when there is no limit. */
    allowed: number | null;
};

/** This month's minutes for the stats routes and the dashboard. */
export async function minutesSummary(
    userId: string,
    plan: AccountPlan,
): Promise<MinutesSummary> {
    const allowed = minutesAllowedFor(plan);
    if (allowed === null) return { used: 0, allowed: null };
    return { used: await minutesSource.used(userId), allowed };
}

export type Reservation =
    | { ok: true; charged: number; used: number; allowed: number | null }
    | { ok: false; needed: number; used: number; allowed: number };

/**
 * Reserves `minutes` for one encode. Takes a per-account advisory lock for
 * the transaction, so two encodes can't both take the last minutes. A job
 * that already reserved (a retry) gets its reservation back without being
 * charged again.
 */
export async function reserveMinutes(input: {
    userId: string;
    appId: string;
    mediaRowId: string;
    jobId: string;
    kind: "hls" | "mp4";
    minutes: number;
    plan: AccountPlan;
    now?: Date;
}): Promise<Reservation> {
    const allowed = minutesAllowedFor(input.plan);
    if (allowed === null) {
        return { ok: true, charged: 0, used: 0, allowed: null };
    }
    const now = input.now ?? new Date();
    const fields = {
        app_id: input.appId,
        job_id: input.jobId,
        kind: input.kind,
        plan: input.plan,
    };
    const outcome = await getDb().transaction(
        async (tx): Promise<Reservation & { firstRefusal?: boolean }> => {
            await tx.execute(
                sql`SELECT pg_advisory_xact_lock(hashtext(${`processing_minutes:${input.userId}`}))`,
            );
            const existing = await tx.execute(
                sql`SELECT minutes FROM processing_usage WHERE job_id = ${input.jobId}`,
            );
            const used = await minutesUsedIn(tx, input.userId, now);
            if (existing.rows.length > 0) {
                return {
                    ok: true,
                    charged: Number(
                        (existing.rows[0] as { minutes: number }).minutes,
                    ),
                    used,
                    allowed,
                };
            }
            if (used + input.minutes > allowed) {
                const marker = await tx.execute(
                    sql`INSERT INTO processing_usage
                            (id, user_id, media_id, job_id, kind, minutes, created_at)
                        VALUES (${randomUUID()}, ${input.userId}, NULL,
                            ${`${EXHAUSTED_KIND}:${input.userId}:${monthStart(now).toISOString().slice(0, 7)}`},
                            ${EXHAUSTED_KIND}, 0, ${now.toISOString()})
                        ON CONFLICT (job_id) DO NOTHING
                        RETURNING id`,
                );
                return {
                    ok: false,
                    needed: input.minutes,
                    used,
                    allowed,
                    firstRefusal: marker.rows.length > 0,
                };
            }
            await tx.execute(
                sql`INSERT INTO processing_usage
                        (id, user_id, media_id, job_id, kind, minutes, created_at)
                    VALUES (${randomUUID()}, ${input.userId}, ${input.mediaRowId},
                        ${input.jobId}, ${input.kind}, ${input.minutes}, ${now.toISOString()})`,
            );
            return {
                ok: true,
                charged: input.minutes,
                used: used + input.minutes,
                allowed,
            };
        },
    );

    const { firstRefusal, ...reservation } = outcome;
    if (reservation.ok) {
        logger.info(
            {
                ...fields,
                minutes: reservation.charged,
                minutes_used: reservation.used,
                minutes_allowed: allowed,
            },
            "processing minutes reserved",
        );
        return reservation;
    }
    logger.info(
        {
            ...fields,
            minutes_needed: reservation.needed,
            minutes_used: reservation.used,
            minutes_allowed: reservation.allowed,
        },
        "processing minutes exhausted",
    );
    if (firstRefusal) {
        trackEvent({
            event: "processing_minutes.exhausted",
            source: "billing.processing_minutes",
            appId: input.appId,
            userId: input.userId,
            properties: {
                plan: input.plan,
                minutes_needed: reservation.needed,
                minutes_used: reservation.used,
                minutes_allowed: reservation.allowed,
            },
        });
    }
    return reservation;
}

/** Gives back what a job reserved, when its encode failed for good. */
export async function releaseMinutes(
    jobId: string,
    reason: string,
): Promise<number> {
    const result = await getDb().execute(
        sql`DELETE FROM processing_usage WHERE job_id = ${jobId}
            AND kind <> ${EXHAUSTED_KIND} RETURNING minutes`,
    );
    const minutes = result.rows.reduce(
        (sum, row) => sum + Number((row as { minutes: number }).minutes),
        0,
    );
    if (result.rows.length > 0) {
        logger.info(
            { job_id: jobId, minutes, reason },
            "processing minutes released",
        );
    }
    return minutes;
}

/**
 * Gives back minutes of a media item's encodes whose job is gone or ended
 * without succeeding: the reconciler's case, when a worker died on the last
 * attempt and nothing recorded a result.
 */
export async function releaseOrphanedMinutes(
    db: Executor,
    mediaRowId: string,
    kind: string,
): Promise<number> {
    const result = await db.execute(
        sql`DELETE FROM processing_usage u
            WHERE u.media_id = ${mediaRowId} AND u.kind = ${kind}
            AND NOT EXISTS (
                SELECT 1 FROM jobs j WHERE j.id = u.job_id
                AND j.status IN ('queued', 'running', 'succeeded'))
            RETURNING u.minutes`,
    );
    return result.rows.reduce(
        (sum, row) => sum + Number((row as { minutes: number }).minutes),
        0,
    );
}
