import test, { afterEach, before, describe, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb, type AppDb } from "../../src/db/client";
import * as schema from "../../src/db/schema/index";
import { createAccount, createApp, listApps } from "../../src/db";
import mediaQueries from "../../src/media/queries";
import { maxStorageAllowedSubscribed } from "../../src/config/constants";
import { billingStateSource } from "../../src/billing/entitlements";
import { callTool } from "./call-tool";

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

let user: any;
let app: { id: string; appId: string; name: string };

before(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(__dirname, "../../drizzle"),
    });
    setDb(db as unknown as AppDb);
    user = await createAccount({ email: "hi@example.com" });
    [app] = await listApps(user._id);
});

describe("MCP whoami", () => {
    afterEach(() => mock.restoreAll());

    test("reports the account, the connected app and its usage", async () => {
        mockPaidPlan();
        const queried: unknown[] = [];
        mock.method(mediaQueries, "getMediaCount").mock.mockImplementation(
            async ({ userId, appId }: any) => {
                queried.push([userId, appId]);
                return 3;
            },
        );
        mock.method(mediaQueries, "getTotalSpace").mock.mockImplementation(
            async () => 2048,
        );

        const response = await callTool("whoami", {
            authKind: "oauth",
            user,
            appId: app.id,
        });

        assert.deepEqual(queried, [[user._id, app.id]]);
        assert.deepEqual(response, {
            auth: "oauth",
            email: "hi@example.com",
            app: { id: app.appId, name: app.name, default: true },
            files: 3,
            storage: 2048,
            maxStorage: maxStorageAllowedSubscribed,
        });
        // The app is named by its public ID, never the internal one.
        assert.doesNotMatch(JSON.stringify(response), new RegExp(app.id));
    });

    test("refuses an app that was deleted", async () => {
        const deleted = await createApp({
            userId: user._id,
            name: "Gone",
            deleted: true,
        });
        const response = await callTool("whoami", {
            user,
            appId: deleted.id,
        });
        assert.equal(response.error.code, "tenant_forbidden");
    });
});
