import type { CommercialBillingState } from "@codelitdev/billing/workflows";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import {
    billingComposition,
    deploymentMode,
    type BillingDeploymentMode,
} from "./catalog";
import { getBillingEngine } from "./engine";

export const UNLIMITED_BYTES = Number.MAX_SAFE_INTEGER;

export type AccountPlan = "oss" | "basic" | "pro";

export type PlanUser = { id: string };

/**
 * Where paid state is read from. An object so tests can replace `read`.
 * Returns null when checkout is off.
 */
export const billingStateSource = {
    async read(userId: string): Promise<CommercialBillingState | null> {
        if (billingComposition().deploymentMode !== "cloud") return null;
        return getBillingEngine().commercialState(userId);
    },
};

export type AccountBilling = {
    plan: AccountPlan;
    /** The billing engine's view, or null in OSS mode or with checkout off. */
    billing: CommercialBillingState | null;
};

/** The account's plan. Paid access comes only from the billing engine. */
export async function resolveAccountBilling(
    user: PlanUser,
    mode: BillingDeploymentMode = deploymentMode(),
): Promise<AccountBilling> {
    if (mode === "oss") return { plan: "oss", billing: null };
    const billing = await billingStateSource.read(user.id);
    return { plan: billing?.activePaidPlan ? "pro" : "basic", billing };
}

export async function resolveAccountPlan(
    user: PlanUser,
    mode?: BillingDeploymentMode,
): Promise<AccountPlan> {
    return (await resolveAccountBilling(user, mode)).plan;
}

export function storageLimitFor(plan: AccountPlan): number {
    if (plan === "oss") return UNLIMITED_BYTES;
    return plan === "pro"
        ? maxStorageAllowedSubscribed
        : maxStorageAllowedNotSubscribed;
}

export function uploadLimitFor(plan: AccountPlan): number {
    if (plan === "oss") return UNLIMITED_BYTES;
    return plan === "pro"
        ? maxFileUploadSizeSubscribed
        : maxFileUploadSizeNotSubscribed;
}

export async function maxStorageFor(
    user: PlanUser,
    mode?: BillingDeploymentMode,
): Promise<number> {
    return storageLimitFor(await resolveAccountPlan(user, mode));
}

export async function maxUploadFor(
    user: PlanUser,
    mode?: BillingDeploymentMode,
): Promise<number> {
    return uploadLimitFor(await resolveAccountPlan(user, mode));
}

export type AccountSubscription = {
    /** `cancelling`: cancelled, and paid access continues until `paidThroughAt`. */
    status: "active" | "past_due" | "cancelling";
    interval: "month" | "year" | null;
    paidThroughAt: Date | null;
};

/** The paid subscription the dashboard shows, whatever provider holds it. */
export function accountSubscription(
    account: AccountBilling,
): AccountSubscription | null {
    const billing = account.billing;
    if (!billing?.activePaidPlan) return null;
    return {
        status: billing.cancelAtPeriodEnd
            ? "cancelling"
            : billing.subscriptionStatus === "past_due"
              ? "past_due"
              : "active",
        interval: billing.billingInterval,
        paidThroughAt: billing.paidThroughAt,
    };
}
