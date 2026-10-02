import { getSubscriptionStatus, type User } from "@medialit/models";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import { deploymentMode, type BillingDeploymentMode } from "./catalog";

export const UNLIMITED_BYTES = Number.MAX_SAFE_INTEGER;

export type AccountPlan = "oss" | "basic" | "pro";

type PlanUser = Pick<User, "subscriptionStatus" | "subscriptionEndsAfter">;

export function accountPlan(
    user: PlanUser,
    mode: BillingDeploymentMode = deploymentMode(),
): AccountPlan {
    if (mode === "oss") return "oss";
    return getSubscriptionStatus(user as User) ? "pro" : "basic";
}

export function maxStorageFor(
    user: PlanUser,
    mode: BillingDeploymentMode = deploymentMode(),
): number {
    if (mode === "oss") return UNLIMITED_BYTES;
    return getSubscriptionStatus(user as User)
        ? maxStorageAllowedSubscribed
        : maxStorageAllowedNotSubscribed;
}

export function maxUploadFor(
    user: PlanUser,
    mode: BillingDeploymentMode = deploymentMode(),
): number {
    if (mode === "oss") return UNLIMITED_BYTES;
    return getSubscriptionStatus(user as User)
        ? maxFileUploadSizeSubscribed
        : maxFileUploadSizeNotSubscribed;
}
