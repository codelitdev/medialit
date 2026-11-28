export type WebhookEvent =
    | "media.processing.ready"
    | "media.processing.failed"
    | "media.captions.ready";

/** A webhook endpoint as the dashboard sees it. `id` is the public ID. The
 * signing secret is returned only on create and rotate; it can be read
 * again with an explicit reveal action. */
export interface WebhookEndpoint {
    id: string;
    url: string;
    events: WebhookEvent[];
    enabled: boolean;
    /** The signing secret's last characters. */
    secretHint: string;
    secret?: string;
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
