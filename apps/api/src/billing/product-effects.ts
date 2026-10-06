import { eq } from "drizzle-orm";
import type { CanonicalSubscription } from "@codelitdev/billing/core";
import type { SubscriptionStatus } from "@medialit/models";
import { profiles } from "@/db/schema/domain";

type ProfileWriter = {
    update: (table: typeof profiles) => {
        set: (values: {
            subscriptionMethod: "dodo";
            customerId: string;
            subscriptionId: string;
            subscriptionStatus: SubscriptionStatus;
            subscriptionEndsAfter: Date | null;
        }) => {
            where: (clause: unknown) => Promise<unknown>;
        };
    };
};

export function profilePatchFromSubscription(next: CanonicalSubscription): {
    subscriptionMethod: "dodo";
    customerId: string;
    subscriptionId: string;
    subscriptionStatus: SubscriptionStatus;
    subscriptionEndsAfter: Date | null;
} {
    const ends = next.paidThroughAt ?? next.currentPeriodEndsAt ?? null;
    if (!next.isEntitlementSource) {
        return {
            subscriptionMethod: "dodo",
            customerId: next.providerCustomerId,
            subscriptionId: next.providerSubscriptionId,
            subscriptionStatus: "not-subscribed",
            subscriptionEndsAfter: ends,
        };
    }
    let subscriptionStatus: SubscriptionStatus = "subscribed";
    if (next.status === "past_due") subscriptionStatus = "paused";
    else if (next.status === "cancelled") subscriptionStatus = "cancelled";
    else if (next.status === "expired") subscriptionStatus = "expired";
    return {
        subscriptionMethod: "dodo",
        customerId: next.providerCustomerId,
        subscriptionId: next.providerSubscriptionId,
        subscriptionStatus,
        subscriptionEndsAfter: ends,
    };
}

export async function applyMedialitProjectionEffects(
    input: {
        material: boolean;
        next: CanonicalSubscription;
    },
    tx: ProfileWriter,
): Promise<void> {
    if (!input.material) return;
    const patch = profilePatchFromSubscription(input.next);
    await tx
        .update(profiles)
        .set(patch)
        .where(eq(profiles.userId, input.next.billableEntityId));
}
