export type WebhookEvent = "media.processing.ready" | "media.processing.failed";

/** A webhook endpoint as the dashboard sees it. `id` is the public ID. The
 * signing secret can be shown again and rotated. */
export interface WebhookEndpoint {
    id: string;
    url: string;
    events: WebhookEvent[];
    enabled: boolean;
    secret: string;
    createdAt: string;
    updatedAt: string;
}

/** One queued event for one endpoint, from its `webhook.deliver` job.
 * The result of the last attempt is only a status code or a generic error
 * class. */
export interface WebhookDelivery {
    id: string;
    endpointId: string;
    event: string;
    webhookId: string;
    mediaId: string | null;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempts: number;
    maxAttempts: number;
    responseStatus?: number;
    error?: string;
    durationMs?: number;
    createdAt: string;
    finishedAt: string | null;
    nextAttemptAt: string | null;
}

/** What a test event did: delivered, or failed with a status code or a
 * generic error class. */
export type WebhookTestResult =
    | { result: "delivered"; status: number }
    | { result: "failed"; status?: number; error?: string };
