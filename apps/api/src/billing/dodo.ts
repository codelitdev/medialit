import { systemClock, type Clock } from "@codelitdev/billing/core";
import { createDodoBillingProvider } from "@codelitdev/billing/providers/dodo";
import type { DodoBillingProviderOptions } from "@codelitdev/billing/providers";

export function dodoOptionsFromEnv(
    env: NodeJS.ProcessEnv = process.env,
    clock: Clock = systemClock,
): DodoBillingProviderOptions {
    const environment = env.DODO_PAYMENTS_ENVIRONMENT;
    return {
        apiKey: env.DODO_PAYMENTS_API_KEY?.trim() ?? "",
        environment:
            environment === "live_mode" || environment === "test_mode"
                ? environment
                : "test_mode",
        webhookSecrets: [
            {
                version: "current",
                secret: env.DODO_PAYMENTS_WEBHOOK_KEY_CURRENT?.trim() ?? "",
            },
        ],
        // Dodo sends every brand's events to every endpoint; others are ignored.
        ...(env.DODO_BRAND_ID?.trim()
            ? { brandId: env.DODO_BRAND_ID.trim() }
            : {}),
        clock,
    };
}

export function createMedialitDodoProvider(
    env: NodeJS.ProcessEnv = process.env,
    clock: Clock = systemClock,
) {
    return createDodoBillingProvider(dodoOptionsFromEnv(env, clock));
}
