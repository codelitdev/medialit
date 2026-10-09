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
            extra: { authKind, userId: user._id, user, apikey: "app-secret" },
        },
    };
}

describe("MCP whoami", () => {
    afterEach(() => mock.restoreAll());

    test("reports the account, the connected app and its usage", async () => {
        mockPaidPlan();
        const queried: unknown[] = [];
        const response = await handleWhoamiTool({}, extra("oauth"), {
            getApiKey: async (key: string) => {
                queried.push(key);
                return {
                    key,
                    keyId: "app-1",
                    name: "My Store",
                    default: true,
                    userId: user._id,
                } as any;
            },
            getMediaCount: async ({ userId, apikey }: any) => {
                queried.push([userId, apikey]);
                return 3;
            },
            getTotalSpace: async () => 2048,
        });

        assert.deepEqual(queried, ["app-secret", ["user-1", "app-secret"]]);
        assert.deepEqual((response as any).structuredContent, {
            auth: "oauth",
            email: "hi@example.com",
            app: { id: "app-1", name: "My Store", default: true },
            files: 3,
            storage: 2048,
            maxStorage: maxStorageAllowedSubscribed,
        });
        assert.doesNotMatch(response.content[0].text, /app-secret/);
    });

    test("rejects calls without auth", async () => {
        const response = await handleWhoamiTool({}, {});
        assert.equal((response as any).isError, true);
    });
});
