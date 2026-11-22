/**
 * Webhook endpoint rows (pipelines-phase-0.md, section 4). Endpoint IDs are
 * public (`wh_…`); `appId` is always the app's internal ID. Functions that
 * run inside another transaction take the executor.
 */
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getUniqueId } from "@medialit/utils";
import { getDb } from "@/db";
import { apps, jobs, webhookEndpoints } from "../db/schema/index.js";
import type { Executor } from "../jobs/queue";

export const WEBHOOK_EVENTS = [
    "media.processing.ready",
    "media.processing.failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_DELIVER_JOB = "webhook.deliver";

/** Endpoints an app may have. */
export const MAX_ENDPOINTS_PER_APP = 10;

export type WebhookEndpointRecord = {
    id: string;
    appId: string;
    url: string;
    secret: string;
    enabled: boolean;
    events: WebhookEvent[];
    createdAt: Date;
    updatedAt: Date;
};

export class WebhookLimitError extends Error {
    constructor(readonly limit: number) {
        super(`An app can have at most ${limit} webhook endpoints`);
        this.name = "WebhookLimitError";
    }
}

function map(row: typeof webhookEndpoints.$inferSelect): WebhookEndpointRecord {
    return {
        id: row.id,
        appId: row.appId,
        url: row.url,
        secret: row.secret,
        enabled: row.enabled,
        events: row.events as WebhookEvent[],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function listEndpoints(
    appId: string,
): Promise<WebhookEndpointRecord[]> {
    const rows = await getDb()
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.appId, appId))
        .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.id));
    return rows.map(map);
}

export async function getEndpoint(
    appId: string,
    id: string,
): Promise<WebhookEndpointRecord | null> {
    const [row] = await getDb()
        .select()
        .from(webhookEndpoints)
        .where(
            and(eq(webhookEndpoints.appId, appId), eq(webhookEndpoints.id, id)),
        )
        .limit(1);
    return row ? map(row) : null;
}

/** Adds an endpoint. The app row is locked so concurrent creates can't
 * pass the limit together. */
export async function insertEndpoint(input: {
    appId: string;
    url: string;
    secret: string;
    enabled: boolean;
    events: WebhookEvent[];
}): Promise<WebhookEndpointRecord> {
    return await getDb().transaction(async (tx) => {
        await tx
            .select({ id: apps.id })
            .from(apps)
            .where(eq(apps.id, input.appId))
            .for("update");
        const [existing] = await tx
            .select({ count: count() })
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.appId, input.appId));
        if (Number(existing?.count ?? 0) >= MAX_ENDPOINTS_PER_APP) {
            throw new WebhookLimitError(MAX_ENDPOINTS_PER_APP);
        }
        const timestamp = new Date();
        const [row] = await tx
            .insert(webhookEndpoints)
            .values({
                id: `wh_${getUniqueId()}`,
                appId: input.appId,
                url: input.url,
                secret: input.secret,
                enabled: input.enabled,
                events: input.events,
                createdAt: timestamp,
                updatedAt: timestamp,
            })
            .returning();
        return map(row);
    });
}

export async function updateEndpoint(
    appId: string,
    id: string,
    patch: Partial<
        Pick<WebhookEndpointRecord, "url" | "secret" | "enabled" | "events">
    >,
): Promise<WebhookEndpointRecord | null> {
    const [row] = await getDb()
        .update(webhookEndpoints)
        .set({ ...patch, updatedAt: new Date() })
        .where(
            and(eq(webhookEndpoints.appId, appId), eq(webhookEndpoints.id, id)),
        )
        .returning();
    return row ? map(row) : null;
}

export async function deleteEndpoint(
    appId: string,
    id: string,
): Promise<boolean> {
    const deleted = await getDb()
        .delete(webhookEndpoints)
        .where(
            and(eq(webhookEndpoints.appId, appId), eq(webhookEndpoints.id, id)),
        )
        .returning({ id: webhookEndpoints.id });
    return deleted.length > 0;
}

/** The enabled endpoints of a live app that subscribe to the event. */
export async function subscribedEndpoints(
    db: Executor,
    appId: string,
    event: WebhookEvent,
): Promise<{ id: string; publicAppId: string }[]> {
    const result = await db.execute(
        sql`SELECT e.id, a.app_id AS "publicAppId"
            FROM webhook_endpoints e JOIN apps a ON a.id = e.app_id
            WHERE e.app_id = ${appId} AND e.enabled AND NOT a.deleted
              AND ${event} = ANY(e.events)
            ORDER BY e.created_at, e.id`,
    );
    return result.rows as { id: string; publicAppId: string }[];
}

/** Where to send a delivery, checked at send time: null when the endpoint
 * is gone or disabled, or its app is deleted. */
export async function deliveryTarget(
    db: Executor,
    endpointId: string,
): Promise<{ url: string; secret: string; appId: string } | null> {
    const result = await db.execute(
        sql`SELECT e.url, e.secret, e.app_id AS "appId"
            FROM webhook_endpoints e JOIN apps a ON a.id = e.app_id
            WHERE e.id = ${endpointId} AND e.enabled AND NOT a.deleted`,
    );
    return (
        (result.rows[0] as
            | { url: string; secret: string; appId: string }
            | undefined) ?? null
    );
}

export type WebhookDeliveryRecord = {
    id: string;
    endpointId: string;
    event: string;
    webhookId: string;
    mediaId: string | null;
    status: string;
    attempts: number;
    maxAttempts: number;
    /** What the last attempt got: a status code or a generic error class. */
    result: { status?: number; error?: string; durationMs?: number } | null;
    createdAt: Date;
    finishedAt: Date | null;
    /** When the next attempt runs, for a delivery that will retry. */
    nextAttemptAt: Date | null;
};

/** The app's most recent deliveries, newest first, from the job rows. */
export async function recentDeliveries(
    appId: string,
    limit = 20,
): Promise<WebhookDeliveryRecord[]> {
    const rows = await getDb()
        .select({
            id: jobs.id,
            payload: jobs.payload,
            status: jobs.status,
            attempts: jobs.attempts,
            maxAttempts: jobs.maxAttempts,
            result: jobs.result,
            createdAt: jobs.createdAt,
            finishedAt: jobs.finishedAt,
            runAt: jobs.runAt,
        })
        .from(jobs)
        .where(and(eq(jobs.appId, appId), eq(jobs.type, WEBHOOK_DELIVER_JOB)))
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(limit);
    return rows.map((row) => {
        const payload = (row.payload ?? {}) as Partial<DeliverPayload>;
        return {
            id: row.id,
            endpointId: payload.endpointId ?? "",
            event: payload.event ?? "",
            webhookId: payload.webhookId ?? "",
            mediaId: payload.mediaId ?? null,
            status: row.status,
            attempts: row.attempts,
            maxAttempts: row.maxAttempts,
            result: (row.result as WebhookDeliveryRecord["result"]) ?? null,
            createdAt: row.createdAt,
            finishedAt: row.finishedAt,
            nextAttemptAt: row.status === "queued" ? row.runAt : null,
        };
    });
}

/** A `webhook.deliver` job's payload. The body is stored serialized, so
 * every attempt sends the same bytes. No secret is ever stored here. */
export type DeliverPayload = {
    endpointId: string;
    webhookId: string;
    event: WebhookEvent;
    mediaId: string | null;
    body: string;
};
