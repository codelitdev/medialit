import { z } from "zod";
import { SUCCESS } from "../../config/strings";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import {
    WEBHOOK_EVENTS,
    WebhookInputError,
    WebhookLimitError,
    WebhookNotFoundError,
    createWebhook,
    deleteWebhook,
    listWebhooks,
    testWebhook,
    updateWebhook,
} from "../../webhooks/service";
import { notFound, toolError } from "./errors";
import { successMessageSchema } from "./schemas";

const eventsSchema = z.array(z.enum(WEBHOOK_EVENTS));

const endpointSchema = z.object({
    id: z.string(),
    url: z.string(),
    events: eventsSchema,
    enabled: z.boolean(),
    secretHint: z.string(),
    secret: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

const testResultSchema = z.object({
    result: z.enum(["delivered", "failed"]),
    status: z.number().int().optional(),
    error: z.string().optional(),
});

const idSchema = z
    .string()
    .describe("ID of the webhook endpoint (wh_…), from list_webhooks");

/** Service errors as tool errors; anything else is an internal error. */
async function run<T>(action: () => Promise<T>) {
    try {
        return await action();
    } catch (error) {
        if (error instanceof WebhookNotFoundError) return notFound();
        if (error instanceof WebhookInputError) {
            return toolError("validation_failed", {
                reason: "invalid_webhook",
                message: error.message,
            });
        }
        if (error instanceof WebhookLimitError) {
            return toolError("conflict", {
                reason: "webhook_limit_reached",
                message: error.message,
            });
        }
        throw error;
    }
}

export const webhookTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "list_webhooks",
        title: "List webhooks",
        risk: "read",
        description:
            "Lists the connected app's webhook endpoints: URL, events, whether each is enabled, and the last characters of its signing secret (secretHint). Secrets themselves are returned only by create_webhook and by update_webhook with rotateSecret. Endpoints receive media.processing.ready and media.processing.failed events, and media.captions.ready when they list it, signed per Standard Webhooks.",
        inputSchema: z.object({}),
        outputSchema: z.object({ endpoints: z.array(endpointSchema) }),
        annotations: { idempotentHint: true },
        handler: async ({ context }) => ({
            endpoints: await listWebhooks(context.appId),
        }),
    }),

    medialitTool({
        name: "create_webhook",
        title: "Create webhook",
        risk: "write",
        description:
            "Adds a webhook endpoint to the connected app and returns it with its signing secret. In production the URL must use https, and it may not point at a private or internal address.",
        inputSchema: z.object({
            url: z.string().describe("The URL that receives events"),
            events: eventsSchema
                .min(1)
                .optional()
                .describe(
                    "Events to send; defaults to media.processing.ready and media.processing.failed. media.captions.ready is sent only to endpoints that list it",
                ),
            enabled: z
                .boolean()
                .optional()
                .describe("Whether to send events; defaults to true"),
        }),
        outputSchema: endpointSchema,
        handler: ({ context, args }) =>
            run(() => createWebhook(context.appId, args)),
    }),

    medialitTool({
        name: "update_webhook",
        title: "Update webhook",
        risk: "write",
        description:
            "Changes a webhook endpoint's URL, events or enabled flag, or rotates its signing secret (rotateSecret: true). Omitted fields keep their values. Only a rotation returns the secret: the new one, which receivers must switch to.",
        inputSchema: z.object({
            id: idSchema,
            url: z.string().optional().describe("New receiving URL"),
            events: eventsSchema.min(1).optional().describe("Events to send"),
            enabled: z.boolean().optional().describe("Turn sending on or off"),
            rotateSecret: z
                .boolean()
                .optional()
                .describe("Replace the signing secret with a new one"),
        }),
        outputSchema: endpointSchema,
        handler: ({ context, args }) =>
            run(() => updateWebhook(context.appId, args.id, args)),
    }),

    medialitTool({
        name: "delete_webhook",
        title: "Delete webhook",
        risk: "destructive",
        description:
            "Removes a webhook endpoint. Deliveries still queued for it are not sent. This can't be undone.",
        inputSchema: z.object({ id: idSchema }),
        outputSchema: successMessageSchema,
        handler: ({ context, args }) =>
            run(async () => {
                await deleteWebhook(context.appId, args.id);
                return { message: SUCCESS };
            }),
    }),

    medialitTool({
        name: "test_webhook",
        title: "Send test webhook",
        risk: "write",
        description:
            'Sends a signed webhook.test event to an endpoint now. Returns result "delivered" with the status code, or "failed" with the status code or a generic error class (timeout, connection_failed, tls_error, blocked_address).',
        inputSchema: z.object({ id: idSchema }),
        outputSchema: testResultSchema,
        annotations: { openWorldHint: true },
        handler: ({ context, args }) =>
            run(() => testWebhook(context.appId, args.id)),
    }),
];
