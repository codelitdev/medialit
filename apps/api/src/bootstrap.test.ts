import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
    findUserByEmail,
    listActiveApiKeys,
    listApps,
    setDb,
    type AppDb,
} from "@/db";
import * as schema from "./db/schema/index.js";
import { createApiKey, getApiKeyBySecret } from "./apikey/queries";
import {
    BOOTSTRAP_KEY_NAME,
    bootstrap,
    checkBootstrapConfig,
} from "./bootstrap";

before(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);
});

const KEY_A = `ml_live_${"a".repeat(64)}`;
const KEY_B = `ml_live_${"b".repeat(64)}`;

describe("bootstrap", () => {
    test("without EMAIL it does nothing", async () => {
        assert.deepEqual(await bootstrap({}), {});
    });

    test("without a bootstrap key it creates the admin and a keyless app", async () => {
        assert.deepEqual(await bootstrap({ EMAIL: "Solo@Example.com" }), {});
        const admin = await findUserByEmail("solo@example.com");
        assert.ok(admin);
        const apps = await listApps(admin.id);
        assert.equal(apps.length, 1);
        assert.deepEqual(await listActiveApiKeys(apps[0].id), []);
    });

    test("syncs the configured key on every start", async () => {
        const env = {
            EMAIL: "admin@example.com",
            MEDIALIT_BOOTSTRAP_API_KEY: KEY_A,
        };

        const first = await bootstrap(env);
        assert.equal(first.key, "created");
        const found = await getApiKeyBySecret(KEY_A);
        assert.equal(found?.key.name, BOOTSTRAP_KEY_NAME);
        assert.equal(found?.key.createdByType, "bootstrap");
        assert.equal(found?.app.appId, first.appId);
        assert.equal(found?.app.default, true);

        assert.equal((await bootstrap(env)).key, "unchanged");

        const rotated = await bootstrap({
            ...env,
            MEDIALIT_BOOTSTRAP_API_KEY: KEY_B,
        });
        assert.equal(rotated.key, "created");
        assert.equal(await getApiKeyBySecret(KEY_A), null);
        assert.notEqual(await getApiKeyBySecret(KEY_B), null);

        assert.equal((await bootstrap(env)).key, "restored");
        assert.notEqual(await getApiKeyBySecret(KEY_A), null);
        assert.equal(await getApiKeyBySecret(KEY_B), null);

        // Removing the setting leaves the key working.
        await bootstrap({ EMAIL: "admin@example.com" });
        assert.notEqual(await getApiKeyBySecret(KEY_A), null);
    });

    test("refuses a value that belongs to a dashboard key", async () => {
        await bootstrap({ EMAIL: "owner@example.com" });
        const owner = await findUserByEmail("owner@example.com");
        const [app] = await listApps(owner!.id);
        const { secret } = await createApiKey({ appId: app.id, name: "Mine" });

        await assert.rejects(
            bootstrap({
                EMAIL: "owner@example.com",
                MEDIALIT_BOOTSTRAP_API_KEY: secret,
            }),
            /matches an API key created in the dashboard/,
        );
    });
});

describe("checkBootstrapConfig", () => {
    test("rejects a malformed key", () => {
        for (const value of [
            "short",
            `ml_live_${"a".repeat(30)}`,
            `${KEY_A} x`,
        ]) {
            assert.throws(
                () =>
                    checkBootstrapConfig({
                        EMAIL: "admin@example.com",
                        MEDIALIT_BOOTSTRAP_API_KEY: value,
                    }),
                /MEDIALIT_BOOTSTRAP_API_KEY must be/,
                value,
            );
        }
    });

    test("requires EMAIL with a key", () => {
        assert.throws(
            () => checkBootstrapConfig({ MEDIALIT_BOOTSTRAP_API_KEY: KEY_A }),
            /EMAIL is required/,
        );
    });

    test("accepts a well-formed key or no key", () => {
        checkBootstrapConfig({});
        checkBootstrapConfig({
            EMAIL: "a@example.com",
            MEDIALIT_BOOTSTRAP_API_KEY: KEY_A,
        });
        checkBootstrapConfig({
            EMAIL: "a@example.com",
            MEDIALIT_BOOTSTRAP_API_KEY:
                "0123456789abcdef0123456789abcdef0123456789abcdef",
        });
    });
});
