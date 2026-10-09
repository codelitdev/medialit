import { systemClock, type Clock } from "@codelitdev/billing/core";
import type {
    BillingProviderAdapter,
    DodoBillingProviderOptions,
    LemonSqueezyBillingProviderOptions,
} from "@codelitdev/billing/providers";
import { createDodoBillingProvider } from "@codelitdev/billing/providers/dodo";
import { createLemonSqueezyBillingProvider } from "@codelitdev/billing/providers/lemonsqueezy";
import type { BillingProviderName } from "./catalog";

export function lemonSqueezyOptionsFromEnv(
    env: NodeJS.ProcessEnv = process.env,
    clock: Clock = systemClock,
): LemonSqueezyBillingProviderOptions {
    const previous = env.LEMONSQUEEZY_WEBHOOK_SECRET_PREVIOUS?.trim();
    return {
        apiKey: env.LEMONSQUEEZY_API_KEY?.trim() ?? "",
        storeId: env.LEMONSQUEEZY_STORE_ID?.trim() ?? "",
        webhookSecrets: [
            {
                version: "current",
                secret: env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() ?? "",
            },
            ...(previous ? [{ version: "previous", secret: previous }] : []),
        ],
        clock,
    };
}

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

/** The adapter for one provider. */
export function createConfiguredProvider(
    provider: BillingProviderName,
    env: NodeJS.ProcessEnv = process.env,
    clock: Clock = systemClock,
): BillingProviderAdapter {
    return provider === "lemonsqueezy"
        ? createLemonSqueezyBillingProvider(
              lemonSqueezyOptionsFromEnv(env, clock),
          )
        : createDodoBillingProvider(dodoOptionsFromEnv(env, clock));
}

/** Adapters for every connected provider. */
export function createConfiguredProviders(
    providers: readonly BillingProviderName[],
    env: NodeJS.ProcessEnv = process.env,
    clock: Clock = systemClock,
): BillingProviderAdapter[] {
    return providers.map((provider) =>
        createConfiguredProvider(provider, env, clock),
    );
}
