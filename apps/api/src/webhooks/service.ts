/**
 * Managing an app's webhook endpoints, shared by REST, MCP and the
 * dashboard. Every function takes the app's internal ID.
 */
import type { WebhookDelivery, WebhookEndpoint } from "@medialit/models";
import { getAppById } from "@/db";
import {
    guardOptionsFromEnv,
    validateWebhookUrl,
    WebhookUrlError,
    type GuardOptions,
} from "./guard";
import {
    DEFAULT_WEBHOOK_EVENTS,
    WEBHOOK_EVENTS,
    deleteEndpoint,
    getEndpoint,
    insertEndpoint,
    listEndpoints,
    recentDeliveries,
    updateEndpoint,
    type WebhookEndpointRecord,
    type WebhookEvent,
} from "./queries";
import { sendTestEvent, type TestResult } from "./delivery";
import { generateSecret } from "./signing";
import logger from "../services/log";
import { trackEvent } from "../services/events";

export { WebhookLimitError, WEBHOOK_EVENTS } from "./queries";

/** Bad input; the message is safe to show. */
export class WebhookInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WebhookInputError";
    }
}

export class WebhookNotFoundError extends Error {
    constructor() {
        super("Webhook endpoint not found");
        this.name = "WebhookNotFoundError";
    }
}

/** `…` and the secret's last 4 characters. */
export function secretHint(secret: string): string {
    return `…${secret.slice(-4)}`;
}

/** An endpoint as clients see it. The secret is left out unless
 * `withSecret`: reading endpoints needs only read access, and the secret
 * would let its holder sign webhooks. */
export function publicEndpoint(
    row: WebhookEndpointRecord,
    options: { withSecret?: boolean } = {},
): WebhookEndpoint {
    return {
        id: row.id,
        url: row.url,
        events: row.events,
        enabled: row.enabled,
        secretHint: secretHint(row.secret),
        ...(options.withSecret ? { secret: row.secret } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export function parseEvents(value: unknown): WebhookEvent[] | undefined {
    if (value === undefined || value === null) return undefined;
    const list =
        typeof value === "string"
            ? value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
            : value;
    if (!Array.isArray(list) || list.length === 0) {
        throw new WebhookInputError(
            `events must list at least one of: ${WEBHOOK_EVENTS.join(", ")}`,
        );
    }
    const unknown = list.filter(
        (entry) => !(WEBHOOK_EVENTS as readonly unknown[]).includes(entry),
    );
    if (unknown.length > 0) {
        throw new WebhookInputError(
            `Unknown event ${String(unknown[0])}. Events: ${WEBHOOK_EVENTS.join(", ")}`,
        );
    }
    return [...new Set(list as WebhookEvent[])];
}

function parseEnabled(value: unknown): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "boolean") {
        throw new WebhookInputError("enabled must be true or false");
    }
    return value;
}

async function checkedUrl(value: unknown, guard: GuardOptions) {
    try {
        return await validateWebhookUrl(value, guard);
    } catch (error) {
        if (error instanceof WebhookUrlError) {
            throw new WebhookInputError(error.message);
        }
        throw error;
    }
}

export type ServiceOptions = { guard?: GuardOptions };

type EndpointAction = "created" | "updated" | "rotated" | "deleted";

function reportEndpointChanged(
    appId: string,
    endpointId: string,
    action: EndpointAction,
): void {
    const fields = { app_id: appId, endpoint_id: endpointId, action };
    logger.info(fields, "webhook endpoint changed");
    trackEvent({
        event: "webhook.endpoint_changed",
        source: "webhooks.endpoints",
        appId,
        properties: { endpoint_id: endpointId, action },
    });
}

export async function createWebhook(
    appId: string,
    input: { url?: unknown; events?: unknown; enabled?: unknown },
    options: ServiceOptions = {},
): Promise<WebhookEndpoint> {
    const guard = options.guard ?? guardOptionsFromEnv();
    const events = parseEvents(input.events) ?? [...DEFAULT_WEBHOOK_EVENTS];
    const enabled = parseEnabled(input.enabled) ?? true;
    const url = await checkedUrl(input.url, guard);
    const row = await insertEndpoint({
        appId,
        url,
        secret: generateSecret(),
        enabled,
        events,
    });
    reportEndpointChanged(appId, row.id, "created");
    return publicEndpoint(row, { withSecret: true });
}

export async function listWebhooks(appId: string): Promise<WebhookEndpoint[]> {
    return (await listEndpoints(appId)).map((row) => publicEndpoint(row));
}

/** The endpoint's signing secret. Callers must require write access. */
export async function revealWebhookSecret(
    appId: string,
    id: unknown,
): Promise<{ id: string; secret: string }> {
    if (typeof id !== "string" || !id) {
        throw new WebhookInputError("id is required");
    }
    const endpoint = await getEndpoint(appId, id);
    if (!endpoint) throw new WebhookNotFoundError();
    return { id: endpoint.id, secret: endpoint.secret };
}

export async function listWebhookDeliveries(
    appId: string,
    limit?: number,
): Promise<WebhookDelivery[]> {
    return recentDeliveries(appId, limit);
}

export async function updateWebhook(
    appId: string,
    id: unknown,
    input: {
        url?: unknown;
        events?: unknown;
        enabled?: unknown;
        rotateSecret?: unknown;
    },
    options: ServiceOptions = {},
): Promise<WebhookEndpoint> {
    if (typeof id !== "string" || !id) {
        throw new WebhookInputError("id is required");
    }
    const patch: Parameters<typeof updateEndpoint>[2] = {};
    if (input.url !== undefined && input.url !== null) {
        patch.url = await checkedUrl(
            input.url,
            options.guard ?? guardOptionsFromEnv(),
        );
    }
    const events = parseEvents(input.events);
    if (events) patch.events = events;
    const enabled = parseEnabled(input.enabled);
    if (enabled !== undefined) patch.enabled = enabled;
    if (input.rotateSecret !== undefined && input.rotateSecret !== null) {
        if (typeof input.rotateSecret !== "boolean") {
            throw new WebhookInputError("rotateSecret must be true or false");
        }
        if (input.rotateSecret) patch.secret = generateSecret();
    }
    if (Object.keys(patch).length === 0) {
        throw new WebhookInputError(
            "Pass url, events, enabled or rotateSecret to change",
        );
    }
    const row = await updateEndpoint(appId, id, patch);
    if (!row) throw new WebhookNotFoundError();
    reportEndpointChanged(
        appId,
        row.id,
        patch.secret !== undefined ? "rotated" : "updated",
    );
    // A new secret is returned once, to the caller who rotated it.
    return publicEndpoint(row, { withSecret: patch.secret !== undefined });
}

export async function deleteWebhook(appId: string, id: unknown): Promise<void> {
    if (typeof id !== "string" || !id) {
        throw new WebhookInputError("id is required");
    }
    if (!(await deleteEndpoint(appId, id))) throw new WebhookNotFoundError();
    reportEndpointChanged(appId, id, "deleted");
}

export async function testWebhook(
    appId: string,
    id: unknown,
    options: ServiceOptions = {},
): Promise<TestResult> {
    if (typeof id !== "string" || !id) {
        throw new WebhookInputError("id is required");
    }
    const endpoint = await getEndpoint(appId, id);
    const app = await getAppById(appId);
    if (!endpoint || !app || app.deleted) throw new WebhookNotFoundError();
    return await sendTestEvent({
        endpoint,
        publicAppId: app.appId,
        guard: options.guard,
    });
}
