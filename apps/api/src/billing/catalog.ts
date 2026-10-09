import { BillingConfigurationError } from "@codelitdev/billing/core";
import {
    validateCatalog,
    type BillingOffer as PackageBillingOffer,
} from "@codelitdev/billing/catalog";

export const billingCatalogKeys = ["pro_month", "pro_year"] as const;
export type BillingCatalogKey = (typeof billingCatalogKeys)[number];
export type BillingInterval = "month" | "year";

export const PRO_MONTH_OFFER_KEY = "pro_month";
export const PRO_YEAR_OFFER_KEY = "pro_year";

export type BillingDeploymentMode = "oss" | "cloud";

/**
 * Payment providers MediaLit can use. New checkout goes to BILLING_PROVIDER;
 * every provider with credentials set keeps serving its subscriptions.
 */
export const BILLING_PROVIDERS = ["lemonsqueezy", "dodo"] as const;
export type BillingProviderName = (typeof BILLING_PROVIDERS)[number];

export type CloudBillingConfig = {
    deploymentMode: "cloud";
    /** Where new checkout goes. */
    provider: BillingProviderName;
    /** The checkout provider first, then every other provider with credentials. */
    providers: BillingProviderName[];
    catalogRevision: number;
    currency: string;
    offers: PackageBillingOffer[];
};

export type BillingComposition = { deploymentMode: "oss" } | CloudBillingConfig;

const offerEnv: Record<
    BillingCatalogKey,
    { amount: string; product: string; interval: BillingInterval }
> = {
    pro_month: {
        amount: "BILLING_PRO_MONTH_AMOUNT_MINOR",
        product: "BILLING_PRO_MONTH_PRODUCT_ID",
        interval: "month",
    },
    pro_year: {
        amount: "BILLING_PRO_YEAR_AMOUNT_MINOR",
        product: "BILLING_PRO_YEAR_PRODUCT_ID",
        interval: "year",
    },
};

const CLOUD_ENV = [
    "BILLING_PROVIDER",
    "BILLING_CATALOG_REVISION",
    "BILLING_CURRENCY",
    "BILLING_PRO_MONTH_AMOUNT_MINOR",
    "BILLING_PRO_YEAR_AMOUNT_MINOR",
    "BILLING_PRO_MONTH_PRODUCT_ID",
    "BILLING_PRO_YEAR_PRODUCT_ID",
    "BILLING_DATA_ENCRYPTION_KEY",
] as const;

/** Credentials each provider needs, on top of CLOUD_ENV. */
export const PROVIDER_ENV: Record<BillingProviderName, readonly string[]> = {
    lemonsqueezy: [
        "LEMONSQUEEZY_API_KEY",
        "LEMONSQUEEZY_STORE_ID",
        "LEMONSQUEEZY_WEBHOOK_SECRET",
    ],
    dodo: ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY_CURRENT"],
};

export function deploymentMode(
    env: NodeJS.ProcessEnv = process.env,
): BillingDeploymentMode {
    return env.MEDIALIT_DEPLOYMENT_MODE === "oss" ? "oss" : "cloud";
}

export function proOfferKey(interval: BillingInterval): BillingCatalogKey {
    return interval === "year" ? PRO_YEAR_OFFER_KEY : PRO_MONTH_OFFER_KEY;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name];
    if (value === undefined || value.length === 0) {
        throw new BillingConfigurationError(`${name}_missing`);
    }
    if (value !== value.trim()) {
        throw new BillingConfigurationError(`${name}_whitespace`);
    }
    return value;
}

/**
 * Providers other than the checkout one, kept while they still hold
 * subscriptions. A provider counts when any of its credentials is set; then
 * all of them must be.
 */
function servingProviders(
    env: NodeJS.ProcessEnv,
    checkout: BillingProviderName,
): BillingProviderName[] {
    return BILLING_PROVIDERS.filter((name) => {
        if (name === checkout) return false;
        const set = PROVIDER_ENV[name].filter((key) => env[key]?.trim());
        if (set.length === 0) return false;
        if (set.length !== PROVIDER_ENV[name].length) {
            throw new BillingConfigurationError(`${name}_config_incomplete`);
        }
        return true;
    });
}

function positiveSafeInteger(value: string, name: string): number {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
        throw new BillingConfigurationError(`${name}_must_be_decimal_integer`);
    }
    const parsed = Number(value);
    if (
        !Number.isSafeInteger(parsed) ||
        parsed <= 0 ||
        parsed > 2_147_483_647
    ) {
        throw new BillingConfigurationError(`${name}_out_of_range`);
    }
    return parsed;
}

/**
 * Paid catalog for the configured provider. Returns null for OSS and for a
 * cloud process with no billing env vars. A partial configuration throws.
 */
export function readCloudBillingConfig(
    env: NodeJS.ProcessEnv = process.env,
): CloudBillingConfig | null {
    if (deploymentMode(env) === "oss") return null;
    const present = CLOUD_ENV.filter((name) => {
        const value = env[name];
        return value !== undefined && value.length > 0;
    });
    if (present.length === 0) return null;
    if (present.length !== CLOUD_ENV.length) {
        throw new BillingConfigurationError("billing_cloud_config_incomplete");
    }
    const provider = required(env, "BILLING_PROVIDER") as BillingProviderName;
    if (!BILLING_PROVIDERS.includes(provider)) {
        throw new BillingConfigurationError("BILLING_PROVIDER_invalid");
    }
    for (const name of PROVIDER_ENV[provider]) required(env, name);
    const providers = [provider, ...servingProviders(env, provider)];

    const revision = positiveSafeInteger(
        required(env, "BILLING_CATALOG_REVISION"),
        "BILLING_CATALOG_REVISION",
    );
    const currency = required(env, "BILLING_CURRENCY").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new BillingConfigurationError("BILLING_CURRENCY_invalid");
    }

    const offers = billingCatalogKeys.map((key) => {
        const definition = offerEnv[key];
        const providerProductId = required(env, definition.product);
        if (!/^[^\s]{2,256}$/.test(providerProductId)) {
            throw new BillingConfigurationError(
                `${definition.product}_invalid`,
            );
        }
        return {
            key,
            revision,
            plan: "pro",
            interval: definition.interval,
            currency,
            amountMinor: positiveSafeInteger(
                required(env, definition.amount),
                definition.amount,
            ),
            provider,
            providerProductId,
            providerTrialDays: 0,
        } satisfies PackageBillingOffer;
    });

    const productIds = new Set(offers.map((offer) => offer.providerProductId));
    if (productIds.size !== offers.length) {
        throw new BillingConfigurationError("provider_products_must_be_unique");
    }

    validateCatalog({
        offers,
        requiredOfferKeys: [...billingCatalogKeys],
        revision,
        checkoutProvider: provider,
    });
    return {
        deploymentMode: "cloud",
        provider,
        providers,
        catalogRevision: revision,
        currency,
        offers,
    };
}

/** OSS, and cloud with no billing settings, compose an engine with no checkout. */
export function billingComposition(
    env: NodeJS.ProcessEnv = process.env,
): BillingComposition {
    return readCloudBillingConfig(env) ?? { deploymentMode: "oss" };
}
