import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { getDb, setDb, type AppDb } from "./client.js";
import * as schema from "./schema/index.js";
import {
    ApiKeyLimitError,
    countMedia,
    createAccount,
    createApp,
    createMediaRecord,
    createSignature,
    deleteExpiredSignatures,
    findApiKeyByHash,
    findApiKeyForAuth,
    getAppByPublicId,
    getMediaRecord,
    getSignature,
    insertApiKey,
    listActiveApiKeys,
    listApps,
    listMedia,
    revokeApiKey,
    sealMediaRecord,
    softDeleteApp,
    syncBootstrapApiKey,
    touchApiKeyLastUsed,
} from "./repository.js";
import { createApiKey, getApiKeyBySecret } from "../apikey/queries.js";
import { hashApiKeySecret } from "../apikey/secret.js";

before(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);
});

let accountCount = 0;
async function account() {
    accountCount += 1;
    return createAccount({ email: `owner${accountCount}@example.com` });
}

describe("repository", () => {
    test("keeps temp semantics and group prefixes per app", async () => {
        const user = await account();
        const app = await createApp({ userId: user.id, name: "Second" });

        await createMediaRecord({
            fileName: "objects/a",
            mediaId: "media-sealed",
            userId: user.id,
            appId: app.id,
            originalFileName: "a.png",
            mimeType: "image/png",
            size: 10,
            thumbnailGenerated: false,
            accessControl: "private",
            group: "photos/vacation",
            temp: true,
        });
        await createMediaRecord({
            fileName: "objects/b",
            mediaId: "media-listed",
            userId: user.id,
            appId: app.id,
            originalFileName: "b.png",
            mimeType: "image/png",
            size: 20,
            thumbnailGenerated: false,
            accessControl: "private",
            group: "Photos/other",
            temp: false,
        });

        assert.equal(await countMedia({ userId: user.id, appId: app.id }), 1);
        assert.notEqual(
            await getMediaRecord({
                userId: user.id,
                appId: app.id,
                mediaId: "media-sealed",
            }),
            null,
        );

        await sealMediaRecord({
            userId: user.id,
            appId: app.id,
            mediaId: "media-sealed",
        });
        assert.equal(await countMedia({ userId: user.id, appId: app.id }), 2);

        const prefixed = await listMedia({
            userId: user.id,
            appId: app.id,
            group: "photos",
        });
        assert.deepEqual(
            prefixed.map((row) => row.mediaId),
            ["media-sealed"],
        );

        const signature = await createSignature({
            userId: user.id,
            appId: app.id,
            validTill: new Date(Date.now() - 1000),
        });
        assert.notEqual(await getSignature(signature.signature), null);
        await deleteExpiredSignatures(user.id);
        assert.equal(await getSignature(signature.signature), null);
    });

    test("a new account gets a default app with no API key", async () => {
        const user = await account();
        const apps = await listApps(user.id);

        assert.equal(apps.length, 1);
        assert.equal(apps[0].default, true);
        assert.deepEqual(await listActiveApiKeys(apps[0].id), []);
    });
});

describe("API keys", () => {
    test("stores only the hash and display prefix", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey, secret } = await createApiKey({
            appId: app.id,
            name: "Server",
            createdById: user.id,
        });

        assert.match(secret, /^ml_live_[A-Za-z0-9_-]{43}$/);
        assert.match(apiKey.apiKeyId, /^ak_/);
        assert.equal(apiKey.keyPrefix, secret.slice(0, 12));
        assert.equal(apiKey.keyHash, hashApiKeySecret(secret));
        const [row] = await getDb()
            .select()
            .from(schema.apiKeys)
            .where(eq(schema.apiKeys.id, apiKey.id));
        assert.equal(JSON.stringify(row).includes(secret), false);
    });

    test("resolves a secret to its key, app and owner", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey, secret } = await createApiKey({
            appId: app.id,
            name: "Server",
        });

        const found = await getApiKeyBySecret(secret);
        assert.equal(found?.key.id, apiKey.id);
        assert.equal(found?.app.id, app.id);
        assert.equal(found?.ownerActive, true);
        assert.equal(await getApiKeyBySecret(`${secret}x`), null);
    });

    test("revoked keys, expired keys and keys of deleted apps don't resolve", async () => {
        const user = await account();
        const app = await createApp({ userId: user.id, name: "Doomed" });
        const revoked = await createApiKey({ appId: app.id, name: "Revoked" });
        const expired = await insertApiKey({
            appId: app.id,
            name: "Expired",
            keyHash: hashApiKeySecret("expired-secret"),
            keyPrefix: "expi",
            createdByType: "user",
            expiresAt: new Date(Date.now() - 1000),
        });
        const live = await createApiKey({ appId: app.id, name: "Live" });

        assert.equal(await revokeApiKey(app.id, revoked.apiKey.apiKeyId), true);
        assert.equal(await findApiKeyForAuth(revoked.apiKey.keyHash), null);
        assert.equal(await findApiKeyForAuth(expired.keyHash), null);
        assert.notEqual(await findApiKeyForAuth(live.apiKey.keyHash), null);
        assert.deepEqual(
            (await listActiveApiKeys(app.id)).map((key) => key.name),
            ["Live"],
        );

        await softDeleteApp(user.id, app.appId);
        assert.equal(await findApiKeyForAuth(live.apiKey.keyHash), null);
        assert.equal(await getAppByPublicId(user.id, app.appId), null);
        assert.notEqual(
            (await findApiKeyByHash(live.apiKey.keyHash))?.revokedAt,
            undefined,
            "deleting the app revokes its keys",
        );
    });

    test("revoking a missing or already revoked key returns false", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey } = await createApiKey({ appId: app.id, name: "Once" });

        assert.equal(await revokeApiKey(app.id, "ak_missing"), false);
        assert.equal(await revokeApiKey(app.id, apiKey.apiKeyId), true);
        assert.equal(await revokeApiKey(app.id, apiKey.apiKeyId), false);
    });

    test("deactivated owners are reported, not hidden", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { secret } = await createApiKey({ appId: app.id, name: "Key" });
        await getDb()
            .update(schema.profiles)
            .set({ active: false })
            .where(eq(schema.profiles.userId, user.id));

        assert.equal((await getApiKeyBySecret(secret))?.ownerActive, false);
    });

    test("records last use at most every five minutes", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey } = await createApiKey({ appId: app.id, name: "Key" });

        await touchApiKeyLastUsed(apiKey.id);
        const first = (await findApiKeyByHash(apiKey.keyHash))?.lastUsedAt;
        assert.ok(first);
        await touchApiKeyLastUsed(apiKey.id);
        const second = (await findApiKeyByHash(apiKey.keyHash))?.lastUsedAt;
        assert.equal(second?.getTime(), first.getTime());
    });

    test("an app has at most 10 active keys", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const keys = [];
        for (let index = 0; index < 10; index += 1) {
            keys.push(
                await createApiKey({ appId: app.id, name: `Key ${index}` }),
            );
        }

        await assert.rejects(
            createApiKey({ appId: app.id, name: "Eleventh" }),
            ApiKeyLimitError,
        );
        await revokeApiKey(app.id, keys[0].apiKey.apiKeyId);
        await createApiKey({ appId: app.id, name: "Replacement" });
    });

    test("revoking a key deletes the signatures it minted, and only those", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey } = await createApiKey({ appId: app.id, name: "Key" });
        const minted = await createSignature({
            userId: user.id,
            appId: app.id,
            apiKeyId: apiKey.id,
        });
        const dashboard = await createSignature({
            userId: user.id,
            appId: app.id,
        });

        await revokeApiKey(app.id, apiKey.apiKeyId);
        assert.equal(await getSignature(minted.signature), null);
        assert.notEqual(await getSignature(dashboard.signature), null);
    });

    test("deleting an app deletes all of its signatures", async () => {
        const user = await account();
        const app = await createApp({ userId: user.id, name: "Doomed" });
        const signature = await createSignature({
            userId: user.id,
            appId: app.id,
        });

        await softDeleteApp(user.id, app.appId);
        assert.equal(await getSignature(signature.signature), null);
    });
});

describe("bootstrap keys", () => {
    test("syncs the configured key and keeps it on its app", async () => {
        const user = await account();
        const [defaultApp] = await listApps(user.id);
        const other = await createApp({ userId: user.id, name: "Other" });
        const sync = (appId: string, secret: string) =>
            syncBootstrapApiKey({
                appId,
                keyHash: hashApiKeySecret(secret),
                keyPrefix: secret.slice(0, 12),
                name: "Bootstrap",
            });

        assert.equal(await sync(defaultApp.id, "first-secret"), "created");
        assert.equal(await sync(defaultApp.id, "first-secret"), "unchanged");
        // A later default app doesn't move or break the existing key.
        assert.equal(await sync(other.id, "first-secret"), "unchanged");
        assert.equal(
            (await findApiKeyForAuth(hashApiKeySecret("first-secret")))?.app.id,
            defaultApp.id,
        );

        const signature = await createSignature({
            userId: user.id,
            appId: defaultApp.id,
            apiKeyId: (await findApiKeyByHash(
                hashApiKeySecret("first-secret"),
            ))!.id,
        });
        assert.equal(await sync(defaultApp.id, "second-secret"), "created");
        assert.equal(
            await findApiKeyForAuth(hashApiKeySecret("first-secret")),
            null,
            "rotating revokes the old key",
        );
        assert.equal(await getSignature(signature.signature), null);

        assert.equal(await sync(defaultApp.id, "first-secret"), "restored");
        assert.notEqual(
            await findApiKeyForAuth(hashApiKeySecret("first-secret")),
            null,
        );
        assert.equal(
            await findApiKeyForAuth(hashApiKeySecret("second-secret")),
            null,
        );
    });

    test("refuses a value that belongs to a dashboard key", async () => {
        const user = await account();
        const [app] = await listApps(user.id);
        const { apiKey } = await createApiKey({ appId: app.id, name: "Mine" });

        assert.equal(
            await syncBootstrapApiKey({
                appId: app.id,
                keyHash: apiKey.keyHash,
                keyPrefix: apiKey.keyPrefix,
                name: "Bootstrap",
            }),
            "conflict",
        );
    });
});
