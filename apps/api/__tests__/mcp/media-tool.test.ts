import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import mediaQueries from "../../src/media/queries";
import { callTool } from "./call-tool";
import { maxStorageAllowedSubscribed } from "../../src/config/constants";
import { billingStateSource } from "../../src/billing/entitlements";

function mockPaidPlan() {
    mock.method(billingStateSource, "read").mock.mockImplementation(
        async () => ({
            activePaidPlan: "pro",
            provider: "lemonsqueezy",
            billingInterval: "month" as const,
            subscriptionStatus: "active",
            providerTrialEndsAt: null,
            currentPeriodEndsAt: null,
            paidThroughAt: null,
            cancelAtPeriodEnd: false,
            pendingCheckout: false,
            pendingPlanChange: false,
            projectionVersion: 1,
        }),
    );
}

describe("MCP get_total_storage", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("uses the authenticated user id and returns the account storage limit", async () => {
        mockPaidPlan();
        const user = {
            id: "string-user-id",
            _id: "object-user-id",
        };

        let queriedUserId: unknown;
        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async ({ userId }: any) => {
                queriedUserId = userId;
                return 2103931;
            },
        );
        const response = await callTool("get_total_storage", { user });

        assert.equal(queriedUserId, user._id);
        assert.deepEqual(response, {
            storage: 2103931,
            maxStorage: maxStorageAllowedSubscribed,
        });
    });
});
