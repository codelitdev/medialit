import assert from "node:assert/strict";
import test from "node:test";
import type { WebUser } from "./api";
import { getUserFromSession } from "./user-handlers";

const user: WebUser = {
    id: "user-primary-key",
    userId: "public-billing-id",
    email: "person@example.com",
    active: true,
    name: "Person",
    customerId: "customer-1",
    subscriptionId: "subscription-1",
    subscriptionEndsAfter: null,
    subscriptionMethod: "lemon",
    subscriptionStatus: "subscribed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
};

test("getUserFromSession resolves the full API user with the Better Auth session", async () => {
    let requestedId: string | undefined;
    const result = await getUserFromSession(
        {
            user: { id: user.id, email: user.email },
        },
        async () => {
            requestedId = "session";
            return user;
        },
    );

    assert.equal(requestedId, "session");
    assert.equal(result?.subscriptionStatus, "subscribed");
    assert.equal(result?.subscriptionId, "subscription-1");
});

test("getUserFromSession returns null without an authenticated id", async () => {
    const result = await getUserFromSession(null, async () => {
        throw new Error("repository should not be queried");
    });

    assert.equal(result, null);
});
