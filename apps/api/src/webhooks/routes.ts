import express from "express";
import apikey from "../apikey/middleware";
import { authenticatedApiLimiter } from "../auth/limiters";
import { DATA_READ_SCOPE, DATA_WRITE_SCOPE } from "../auth/options";
import { requireScope } from "../auth/scopes";
import logger from "../services/log";
import {
    WebhookInputError,
    WebhookLimitError,
    WebhookNotFoundError,
    createWebhook,
    deleteWebhook,
    listWebhooks,
    revealWebhookSecret,
    testWebhook,
    updateWebhook,
} from "./service";

/** Maps service errors to responses; anything else is a 500 without
 * details. */
export function sendWebhookError(res: express.Response, error: unknown) {
    if (error instanceof WebhookInputError) {
        return res.status(400).json({ error: error.message });
    }
    if (error instanceof WebhookNotFoundError) {
        return res.status(404).json({ error: error.message });
    }
    if (error instanceof WebhookLimitError) {
        return res.status(409).json({ error: error.message });
    }
    logger.error({ err: error }, "Webhook request failed");
    return res.status(500).json({ error: "Internal Server Error" });
}

function handle(
    action: (req: any, res: express.Response) => Promise<unknown>,
): express.RequestHandler {
    return (req, res) => {
        action(req, res).catch((error) => sendWebhookError(res, error));
    };
}

const router = express.Router();

router.post(
    "/create",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'Create a webhook endpoint'
        #swagger.description = 'Adds an endpoint that receives processing events, and returns its signing secret. The URL is checked: in production it must use https, and it must not resolve to a private or internal address.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/CreateWebhookPayload" }
                }
            }
        }
        #swagger.responses[201] = {
            description: 'Endpoint created',
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookEndpoint" }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[409] = { description: 'The app has the most endpoints allowed' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    handle(async (req, res) => {
        const endpoint = await createWebhook(req.appId, req.body ?? {});
        res.status(201).json(endpoint);
    }),
);

router.post(
    "/get",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'List webhook endpoints'
        #swagger.description = 'Lists the app’s webhook endpoints. Signing secrets are not included, only their last characters (`secretHint`); read a secret with `POST /settings/webhooks/secret`.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.responses[200] = {
            description: 'The endpoints',
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookEndpointList" }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    handle(async (req, res) => {
        res.status(200).json({ endpoints: await listWebhooks(req.appId) });
    }),
);

router.post(
    "/secret",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'Reveal a signing secret'
        #swagger.description = 'Returns the endpoint’s signing secret. Needs write access (`data:write`), like creating or rotating one, because the secret lets its holder sign webhooks.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookIdPayload" }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'The signing secret',
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookSecret" }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Not Found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    handle(async (req, res) => {
        res.status(200).json(
            await revealWebhookSecret(req.appId, req.body?.id),
        );
    }),
);

router.post(
    "/update",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'Update a webhook endpoint'
        #swagger.description = 'Changes the URL, events or enabled flag, or rotates the signing secret. Fields left out keep their values. The response includes `secret` only when it was rotated.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/UpdateWebhookPayload" }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'The updated endpoint',
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookEndpoint" }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Not Found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    handle(async (req, res) => {
        const { id, url, events, enabled, rotateSecret } = req.body ?? {};
        const endpoint = await updateWebhook(req.appId, id, {
            url,
            events,
            enabled,
            rotateSecret,
        });
        res.status(200).json(endpoint);
    }),
);

router.post(
    "/delete",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'Delete a webhook endpoint'
        #swagger.description = 'Removes the endpoint. Deliveries still queued for it are not sent.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookIdPayload" }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'Endpoint deleted',
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string", example: "success" }
                        }
                    }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Not Found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    handle(async (req, res) => {
        await deleteWebhook(req.appId, req.body?.id);
        res.status(200).json({ message: "success" });
    }),
);

router.post(
    "/test",
    /*
        #swagger.tags = ['Webhooks']
        #swagger.summary = 'Send a test event'
        #swagger.description = 'Sends a signed `webhook.test` event to the endpoint now. The result is only "delivered" or "failed", with the status code the endpoint answered or a generic error class.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookIdPayload" }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'What the endpoint did with the test event',
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/WebhookTestResult" }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Not Found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    handle(async (req, res) => {
        res.status(200).json(await testWebhook(req.appId, req.body?.id));
    }),
);

export default router;
