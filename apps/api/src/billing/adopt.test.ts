import assert from "node:assert/strict";
import test from "node:test";
import { planAdoptions, type ProviderSubscription } from "./adopt";

const now = new Date("2026-10-08T00:00:00.000Z");

function subscription(
    patch: Partial<ProviderSubscription>,
): ProviderSubscription {
    return {
        id: "55",
        email: "Owner@Example.com",
        status: "active",
        variantId: "77",
        endsAt: null,
        ...patch,
    };
}

test("adopts paid subscriptions of known accounts and skips the rest", async () => {
    const plans = await planAdoptions(
        [
            subscription({ id: "1" }),
            subscription({
                id: "2",
                status: "cancelled",
                endsAt: new Date("2026-11-01T00:00:00.000Z"),
            }),
            subscription({
                id: "3",
                status: "cancelled",
                endsAt: new Date("2026-09-01T00:00:00.000Z"),
            }),
            subscription({ id: "4", status: "expired" }),
            subscription({ id: "5", variantId: "99" }),
            subscription({ id: "6", email: "nobody@example.com" }),
        ],
        {
            catalogProductIds: new Set(["77", "78"]),
            findUserIdByEmail: async (email) =>
                email === "owner@example.com" ? "user_1" : null,
            now,
        },
    );
    assert.deepEqual(
        plans.map((plan) =>
            plan.action === "adopt"
                ? `${plan.subscription.id}:adopt:${plan.userId}`
                : `${plan.subscription.id}:skip:${plan.reason}`,
        ),
        [
            "1:adopt:user_1",
            "2:adopt:user_1",
            "3:skip:ended",
            "4:skip:ended",
            "5:skip:not_in_catalog",
            "6:skip:no_account",
        ],
    );
});
