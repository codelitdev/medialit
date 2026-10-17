import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleWhoamiTool } from "../../src/mcp/tools/whoami";
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

const user = {
    id: "user-1",
    _id: "user-1",
    email: "hi@example.com",
};

function extra(authKind: "oauth" | "apikey") {
    return {
        authInfo: {
            extra: { authKind, userId: user._id, user, appId: "internal-app" },
        },
    };
}

describe("MCP whoami", () => {
    afterEach(() => mock.restoreAll());

    test("reports the account, the connected app and its usage", async () => {
        mockPaidPlan();
        const queried: unknown[] = [];
        const response = await handleWhoamiTool({}, extra("oauth"), {
            getApp: async (id: string) => {
                queried.push(id);
                return {
                    id,
                    appId: "app-1",
                    name: "My Store",
                    default: true,
                    deleted: false,
                    userId: user._id,
                } as any;
            },
            getMediaCount: async ({ userId, appId }: any) => {
                queried.push([userId, appId]);
                return 3;
            },
            getTotalSpace: async () => 2048,
        });

        assert.deepEqual(queried, ["internal-app", ["user-1", "internal-app"]]);
        assert.deepEqual((response as any).structuredContent, {
            auth: "oauth",
            email: "hi@example.com",
            app: { id: "app-1", name: "My Store", default: true },
            files: 3,
            storage: 2048,
            maxStorage: maxStorageAllowedSubscribed,
        });
        // The app is named by its public ID, never the internal one.
        assert.doesNotMatch(response.content[0].text, /internal-app/);
    });

    test("rejects calls without auth", async () => {
        const response = await handleWhoamiTool({}, {});
        assert.equal((response as any).isError, true);
    });
});
