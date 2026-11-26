import type { PublicBillingCatalog } from "@codelitdev/billing/catalog";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import { PRO_MONTH_OFFER_KEY, PRO_YEAR_OFFER_KEY } from "./catalog";
import { minutesAllowedFor } from "./processing-minutes";

export type PlanLimits = {
    storageBytes: number;
    maxUploadBytes: number;
    /** Video processing minutes a month. */
    processingMinutes: number;
};

export type BillingPlans = {
    /** False when checkout is off, for example in OSS mode or before the catalog is verified. */
    checkoutAvailable: boolean;
    /** ISO 4217 code for the prices, or null without a catalog. */
    currency: string | null;
    /** The account's apps with video streaming on. A downgrade leaves them
     * on, limited to the free plan's minutes. */
    videoStreamingApps: number;
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
    videoStreamingApps = 0,
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
        videoStreamingApps,
        plans: {
            basic: {
                limits: {
                    storageBytes: maxStorageAllowedNotSubscribed,
                    maxUploadBytes: maxFileUploadSizeNotSubscribed,
                    processingMinutes: minutesAllowedFor("basic") ?? 0,
                },
            },
            pro: {
                prices,
                limits: {
                    storageBytes: maxStorageAllowedSubscribed,
                    maxUploadBytes: maxFileUploadSizeSubscribed,
                    processingMinutes: minutesAllowedFor("pro") ?? 0,
                },
            },
        },
    };
}
