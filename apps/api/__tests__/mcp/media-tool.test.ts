import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleGetTotalStorageTool } from "../../src/mcp/tools/media";
import { maxStorageAllowedSubscribed } from "../../src/config/constants";
import { billingStateSource } from "../../src/billing/entitlements";

function mockPaidPlan() {
    mock.method(billingStateSource, "read").mock.mockImplementation(
        async () => ({
            activePaidPlan: "pro",
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
        const response = await handleGetTotalStorageTool(
            {},
            {
                authInfo: {
                    extra: {
                        authKind: "apikey",
                        userId: user._id,
                        user,
                        apikey: "test-api-key",
                    },
                },
            },
            {
                getTotalSpace: async ({ userId }: any) => {
                    queriedUserId = userId;
                    return 2103931;
                },
            },
        );

        assert.equal(queriedUserId, user._id);
        assert.deepEqual((response as any).structuredContent, {
            storage: 2103931,
            maxStorage: maxStorageAllowedSubscribed,
        });
    });
});
