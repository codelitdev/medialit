import type { PublicBillingCatalog } from "@codelitdev/billing/catalog";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import { PRO_MONTH_OFFER_KEY, PRO_YEAR_OFFER_KEY } from "./catalog";

export type PlanLimits = { storageBytes: number; maxUploadBytes: number };

export type BillingPlans = {
    /** False when checkout is off, for example in OSS mode or before the catalog is verified. */
    checkoutAvailable: boolean;
    /** ISO 4217 code for the prices, or null without a catalog. */
    currency: string | null;
    plans: {
        basic: { limits: PlanLimits };
        /** Prices in minor units (cents for USD), or null without a catalog. */
        pro: {
            prices: { month: number; year: number } | null;
            limits: PlanLimits;
        };
    };
};

/**
 * What the billing page shows: Pro prices from the verified billing catalog,
 * and each plan's limits from the same settings the API enforces.
 */
export function billingPlans(
    catalog: PublicBillingCatalog | null,
): BillingPlans {
    const month = catalog?.offers.find(
        (offer) => offer.key === PRO_MONTH_OFFER_KEY,
    );
    const year = catalog?.offers.find(
        (offer) => offer.key === PRO_YEAR_OFFER_KEY,
    );
    const prices =
        month && year
            ? { month: month.amountMinor, year: year.amountMinor }
            : null;
    return {
        checkoutAvailable: Boolean(catalog?.checkoutAvailable && prices),
        currency: prices ? (catalog?.currency ?? null) : null,
        plans: {
            basic: {
                limits: {
                    storageBytes: maxStorageAllowedNotSubscribed,
                    maxUploadBytes: maxFileUploadSizeNotSubscribed,
                },
            },
            pro: {
                prices,
                limits: {
                    storageBytes: maxStorageAllowedSubscribed,
                    maxUploadBytes: maxFileUploadSizeSubscribed,
                },
            },
        },
    };
}
