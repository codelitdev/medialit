/** OpenAPI schemas for the webhook endpoint routes. */
import Joi from "joi";
import { WEBHOOK_EVENTS } from "./queries";

const events = Joi.array()
    .items(Joi.string().valid(...WEBHOOK_EVENTS))
    .min(1)
    .description("Events to send. Defaults to every event.");

export const webhookEndpointSchema = Joi.object({
    id: Joi.string().required().example("wh_V1StGXR8_Z5jdHi6B-myT"),
    url: Joi.string().uri().required().example("https://example.com/hooks"),
    events: events.required(),
    enabled: Joi.boolean().required(),
    secret: Joi.string()
        .required()
        .description("Signing secret (Standard Webhooks).")
        .example("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"),
    createdAt: Joi.string().isoDate().required(),
    updatedAt: Joi.string().isoDate().required(),
});

export const webhookEndpointListSchema = Joi.object({
    endpoints: Joi.array().items(webhookEndpointSchema).required(),
});

export const createWebhookSchema = Joi.object({
    url: Joi.string()
        .uri()
        .required()
        .description("Receiving URL. Must use https in production.")
        .example("https://example.com/hooks"),
    events,
    enabled: Joi.boolean().description("Defaults to true."),
});

export const updateWebhookSchema = Joi.object({
    id: Joi.string().required().example("wh_V1StGXR8_Z5jdHi6B-myT"),
    url: Joi.string().uri(),
    events,
    enabled: Joi.boolean(),
    rotateSecret: Joi.boolean().description(
        "Replace the signing secret with a new one.",
    ),
});

export const webhookIdSchema = Joi.object({
    id: Joi.string().required().example("wh_V1StGXR8_Z5jdHi6B-myT"),
});

export const webhookTestResultSchema = Joi.object({
    result: Joi.string().valid("delivered", "failed").required(),
    status: Joi.number()
        .integer()
        .description("The HTTP status the endpoint answered."),
    error: Joi.string()
        .valid("timeout", "connection_failed", "tls_error", "blocked_address")
        .description("Why no response came back."),
});
