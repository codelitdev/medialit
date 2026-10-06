import { systemClock } from "@codelitdev/billing/core";
import { BillingWorkflowError } from "@codelitdev/billing/core";
import type {
    BillingAction,
    BillingActionGrant,
    BillingAuthorizationPort,
} from "@codelitdev/billing/workflows";

export const medialitBillingAuthorization: BillingAuthorizationPort = {
    async consume(grant, expectedAction, expectedTarget, now) {
        if (
            !grant.grantId.startsWith("preconsumed:") ||
            grant.action !== expectedAction ||
            grant.target.kind !== expectedTarget.kind ||
            grant.target.id !== expectedTarget.id ||
            grant.expiresAt.getTime() <= now.getTime()
        ) {
            throw new BillingWorkflowError("grant_invalid");
        }
    },
};

export function preconsumedGrant(
    action: BillingAction,
    userId: string,
): BillingActionGrant {
    const now = systemClock.now();
    return {
        grantId: `preconsumed:${action}:${userId}:${now.getTime()}`,
        actorId: userId,
        action,
        target: { kind: "user", id: userId },
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    };
}
