/**
 * Webhook events and their delivery.
 *
 * When a job finishing settles a sealed media item's processing status, the
 * settle transaction queues one `webhook.deliver` job per subscribed
 * endpoint (an outbox), so an event is queued exactly once and only if the
 * status change commits. Each job signs and sends the event, and retries
 * with the same `webhook-id` for about 24 hours.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import {
    onBackgroundSettled,
    onProcessingSettled,
    type BackgroundSettledEvent,
    type ProcessingSettledEvent,
} from "../media/derivatives";
import { enqueue, type Executor } from "../jobs/queue";
import {
    permanentError,
    retryableError,
    type FailedReason,
} from "../jobs/errors";
import type { JobDefinition } from "../jobs/runner";
import { guardOptionsFromEnv, type GuardOptions } from "./guard";
import {
    WEBHOOK_DELIVER_JOB,
    deliveryTarget,
    subscribedEndpoints,
    type DeliverPayload,
    type WebhookEvent,
} from "./queries";
import { sendWebhook, type DeliveryResult } from "./send";
import { signedHeaders } from "./signing";
import logger from "../services/log";
import { trackEvent } from "../services/events";

export const WEBHOOK_DELIVER_ATTEMPTS = 8;

/** Waits before attempts 2–8: about 23.6 hours in all. */
const RETRY_SCHEDULE_MS = [
    30_000,
    5 * 60_000,
    30 * 60_000,
    2 * 60 * 60_000,
    5 * 60 * 60_000,
    8 * 60 * 60_000,
    8 * 60 * 60_000,
];

/** The wait after `attempt` failed attempts, with ±10% jitter. */
export function webhookRetryDelayMs(
    attempt: number,
    random: () => number = Math.random,
): number {
    const index = Math.min(
        Math.max(attempt, 1) - 1,
        RETRY_SCHEDULE_MS.length - 1,
    );
    return Math.round(RETRY_SCHEDULE_MS[index] * (0.9 + random() * 0.2));
}

export type MediaEventData = {
    mediaId: string;
    /** The app's public ID. */
    appId: string;
    /** The media's processing status. For `media.captions.ready` it can
     * still be `processing`: captions don't wait for the encodes. */
    status: "ready" | "failed" | "processing";
    derivatives: Record<string, { status: string; error?: string }>;
};

/** A Standard Webhooks payload: `type`, `timestamp` and `data`. */
export function eventBody(type: string, data: unknown, at = new Date()) {
    return JSON.stringify({ type, timestamp: at.toISOString(), data });
}

function newWebhookId(): string {
    return `msg_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Runs in the transaction that settles processing. Media that is still
 * temp never fires; seal answers its caller directly.
 */
export async function queueProcessingWebhooks(
    db: Executor,
    event: ProcessingSettledEvent,
): Promise<void> {
    if (event.media.temp) return;
    const type: WebhookEvent =
        event.status === "ready"
            ? "media.processing.ready"
            : "media.processing.failed";
    const endpoints = await subscribedEndpoints(db, event.media.appId, type);
    if (endpoints.length === 0) return;

    const data: MediaEventData = {
        mediaId: event.media.mediaId,
        appId: endpoints[0].publicAppId,
        status: event.status,
        derivatives: Object.fromEntries(
            event.derivatives.map((derivative) => [
                derivative.name,
                derivative.error
                    ? { status: derivative.status, error: derivative.error }
                    : { status: derivative.status },
            ]),
        ),
    };
    await queueDeliveries(db, endpoints, type, event.media, data);
}

/**
 * Runs in the transaction that records captions as ready or failed for good
 * (pipelines-phase-2.md, D8). One event for both outcomes: the payload's
 * `derivatives.captions` says which.
 */
export async function queueCaptionsWebhooks(
    db: Executor,
    event: BackgroundSettledEvent,
): Promise<void> {
    if (event.media.temp || event.derivative.name !== "captions") return;
    if (
        event.derivative.status !== "ready" &&
        event.derivative.status !== "failed"
    ) {
        return;
    }
    const type: WebhookEvent = "media.captions.ready";
    const endpoints = await subscribedEndpoints(db, event.media.appId, type);
    if (endpoints.length === 0) return;
    const { derivative } = event;
    const data: MediaEventData = {
        mediaId: event.media.mediaId,
        appId: endpoints[0].publicAppId,
        status: mediaStatusOf(event.media.processingStatus),
        derivatives: {
            captions: derivative.error
                ? { status: derivative.status, error: derivative.error }
                : { status: derivative.status },
        },
    };
    await queueDeliveries(db, endpoints, type, event.media, data);
}

function mediaStatusOf(status: string | null): MediaEventData["status"] {
    return status === "failed" || status === "processing" ? status : "ready";
}

async function queueDeliveries(
    db: Executor,
    endpoints: { id: string; publicAppId: string }[],
    type: WebhookEvent,
    media: { mediaId: string; appId: string },
    data: MediaEventData,
): Promise<void> {
    const body = eventBody(type, data);
    // One message ID per event; each endpoint's retries reuse it.
    const webhookId = newWebhookId();
    for (const endpoint of endpoints) {
        const payload: DeliverPayload = {
            endpointId: endpoint.id,
            webhookId,
            event: type,
            mediaId: media.mediaId,
            body,
        };
        await enqueue(db, {
            type: WEBHOOK_DELIVER_JOB,
            payload,
            // No media_id: deleting the media must not drop the event.
            appId: media.appId,
            maxAttempts: WEBHOOK_DELIVER_ATTEMPTS,
        });
    }
}

let registered = false;

/** Hooks webhooks into settling. Called by the API and the worker at
 * startup; settling may happen in either. Safe to call more than once. */
export function registerWebhookHooks(): void {
    if (registered) return;
    onProcessingSettled(queueProcessingWebhooks);
    onBackgroundSettled(queueCaptionsWebhooks);
    registered = true;
}

/** What a delivery stores in `jobs.result`: a status code, the duration
 * and a generic error class. Nothing else. */
export function storedResult(result: DeliveryResult) {
    return result.ok
        ? { status: result.status, durationMs: result.durationMs }
        : {
              ...(result.status !== undefined ? { status: result.status } : {}),
              error: result.error,
              durationMs: result.durationMs,
          };
}

const FAILED_REASON: Record<string, FailedReason> = {
    http_status: "http_status",
    timeout: "timeout",
    blocked_address: "blocked_address",
    tls_error: "connection_failed",
    connection_failed: "connection_failed",
};

export function webhookDeliverJob(
    options: { guard?: () => GuardOptions } = {},
): JobDefinition<DeliverPayload> {
    return {
        type: WEBHOOK_DELIVER_JOB,
        class: "io",
        maxAttempts: WEBHOOK_DELIVER_ATTEMPTS,
        // Each attempt has its own 10 s deadline; this only catches a hang.
        timeoutMs: 60_000,
        retryDelayMs: webhookRetryDelayMs,
        handler: async (payload, context) => {
            // Checked at send time too: the app may have been deleted, or
            // the endpoint removed or disabled, after the job was queued.
            const target = await deliveryTarget(getDb(), payload.endpointId);
            if (!target) return { skipped: "endpoint_unavailable" };
            const result = await sendWebhook({
                url: target.url,
                body: payload.body,
                headers: signedHeaders({
                    secret: target.secret,
                    id: payload.webhookId,
                    body: payload.body,
                }),
                guard: (options.guard ?? guardOptionsFromEnv)(),
                signal: context.signal,
            });
            const stored = storedResult(result);
            const fields = {
                job_id: context.job.id,
                app_id: target.appId,
                endpoint_id: payload.endpointId,
                event_type: payload.event,
                attempts_made: context.job.attempts,
                duration_ms: result.durationMs,
                ...(result.status !== undefined
                    ? { response_code: result.status }
                    : {}),
                ...(result.ok ? {} : { error_class: result.error }),
            };
            if (result.ok) {
                logger.info(fields, "webhook delivered");
                trackEvent({
                    event: "webhook.delivered",
                    source: "webhooks.deliver",
                    appId: target.appId,
                    properties: fields,
                });
                return stored;
            }
            logger.warn(fields, "webhook delivery failed");
            // A URL that resolves to a refused address is not retried;
            // anything else fails for good on the last attempt.
            if (
                result.error === "blocked_address" ||
                context.job.attempts >= context.job.maxAttempts
            ) {
                trackEvent({
                    event: "webhook.delivery_failed",
                    source: "webhooks.deliver",
                    appId: target.appId,
                    properties: fields,
                });
            }
            const message =
                result.error === "http_status"
                    ? `endpoint answered ${result.status}`
                    : `delivery failed (${result.error})`;
            const reason = FAILED_REASON[result.error] ?? "internal";
            if (result.error === "blocked_address") {
                throw permanentError(message, reason, stored);
            }
            throw retryableError(message, reason, stored);
        },
    };
}

export type TestResult =
    | { result: "delivered"; status: number }
    | { result: "failed"; status: number }
    | { result: "failed"; error: string };

/**
 * Sends a `webhook.test` event now and reports only "delivered" or
 * "failed" with a status code or an error class, so it can't be used to
 * probe internal hosts.
 */
export async function sendTestEvent(input: {
    endpoint: { id: string; url: string; secret: string };
    publicAppId: string;
    guard?: GuardOptions;
}): Promise<TestResult> {
    const body = eventBody("webhook.test", {
        appId: input.publicAppId,
        endpointId: input.endpoint.id,
    });
    const result = await sendWebhook({
        url: input.endpoint.url,
        body,
        headers: signedHeaders({
            secret: input.endpoint.secret,
            id: newWebhookId(),
            body,
        }),
        guard: input.guard ?? guardOptionsFromEnv(),
    });
    if (result.ok) return { result: "delivered", status: result.status };
    if (result.error === "http_status" && result.status !== undefined) {
        return { result: "failed", status: result.status };
    }
    return { result: "failed", error: result.error };
}
