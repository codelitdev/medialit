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

export type CloudBillingConfig = {
    deploymentMode: "cloud";
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
        product: "DODO_PRO_MONTH_PRODUCT_ID",
        interval: "month",
    },
    pro_year: {
        amount: "BILLING_PRO_YEAR_AMOUNT_MINOR",
        product: "DODO_PRO_YEAR_PRODUCT_ID",
        interval: "year",
    },
};

const CLOUD_ENV = [
    "BILLING_CATALOG_REVISION",
    "BILLING_CURRENCY",
    "BILLING_PRO_MONTH_AMOUNT_MINOR",
    "BILLING_PRO_YEAR_AMOUNT_MINOR",
    "DODO_PRO_MONTH_PRODUCT_ID",
    "DODO_PRO_YEAR_PRODUCT_ID",
    "DODO_PAYMENTS_API_KEY",
    "DODO_PAYMENTS_WEBHOOK_KEY_CURRENT",
    "BILLING_DATA_ENCRYPTION_KEY",
] as const;

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
 * Paid Dodo catalog. Returns null for OSS and for a cloud process with no
 * billing env vars. A partial cloud configuration throws. Quotas stay on the
 * profile either way.
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
            provider: "dodo",
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
        checkoutProvider: "dodo",
    });
    return {
        deploymentMode: "cloud",
        catalogRevision: revision,
        currency,
        offers,
    };
}

/** OSS, and cloud with no Dodo settings, compose an engine with no checkout. */
export function billingComposition(
    env: NodeJS.ProcessEnv = process.env,
): BillingComposition {
    return readCloudBillingConfig(env) ?? { deploymentMode: "oss" };
}
