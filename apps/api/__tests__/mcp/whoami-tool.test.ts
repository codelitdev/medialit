import { Constants } from "@medialit/models";
import test, { describe } from "node:test";
import assert from "node:assert";
import { handleWhoamiTool } from "../../src/mcp/tools/whoami";
import { maxStorageAllowedSubscribed } from "../../src/config/constants";

const user = {
    id: "user-1",
    _id: "user-1",
    email: "hi@example.com",
    subscriptionStatus: Constants.SubscriptionStatus.SUBSCRIBED,
};

function extra(authKind: "oauth" | "apikey") {
    return {
        authInfo: {
            extra: { authKind, userId: user._id, user, apikey: "app-secret" },
        },
    };
}

describe("MCP whoami", () => {
    test("reports the account, the connected app and its usage", async () => {
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
