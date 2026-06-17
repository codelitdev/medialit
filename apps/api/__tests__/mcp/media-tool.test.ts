import { Constants } from "@medialit/models";
import test, { afterEach, describe, mock } from "node:test";
import assert from "node:assert";
import { handleGetTotalStorageTool } from "../../src/mcp/tools/media";
import { maxStorageAllowedSubscribed } from "../../src/config/constants";

describe("MCP get_total_storage", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    test("uses the authenticated user id and returns the account storage limit", async () => {
        const user = {
            id: "string-user-id",
            _id: "object-user-id",
            subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
        };

        let queriedUserId: unknown;
        const response = await handleGetTotalStorageTool(
            {
                authInfo: {
                    clientId: user.id,
                    token: "test-api-key",
                    user,
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
