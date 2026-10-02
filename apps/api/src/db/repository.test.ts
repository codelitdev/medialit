import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "./migrate.js";
import { setDb, type AppDb } from "./client.js";
import * as schema from "./schema/index.js";
import {
    countMedia,
    createAccount,
    createApiKey,
    createMediaRecord,
    createSignature,
    deleteExpiredSignatures,
    getApiKeyByKeyId,
    getApiKeyBySecret,
    getMediaRecord,
    getSignature,
    listMedia,
    sealMediaRecord,
    softDeleteApiKey,
} from "./repository.js";

before(async () => {
    const client = new PGlite();
    await applyMigrations((statement) => client.exec(statement));
    setDb(drizzle(client, { schema }) as unknown as AppDb);
});

describe("repository", () => {
    test("keeps plaintext keys, temp semantics, and group prefixes", async () => {
        const user = await createAccount({
            email: "owner@example.com",
            name: "Owner",
            subscriptionStatus: "subscribed",
        });
        const extra = await createApiKey({
            userId: user.id,
            name: "Second",
            key: "plain-secret",
        });

        await createMediaRecord({
            fileName: "objects/a",
            mediaId: "media-sealed",
            userId: user.id,
            apikey: extra.key,
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
            apikey: extra.key,
            originalFileName: "b.png",
            mimeType: "image/png",
            size: 20,
            thumbnailGenerated: false,
            accessControl: "private",
            group: "Photos/other",
            temp: false,
        });

        assert.equal(
            await countMedia({ userId: user.id, apikey: extra.key }),
            1,
        );
        assert.notEqual(
            await getMediaRecord({
                userId: user.id,
                apikey: extra.key,
                mediaId: "media-sealed",
            }),
            null,
        );

        await sealMediaRecord({
            userId: user.id,
            apikey: extra.key,
            mediaId: "media-sealed",
        });
        assert.equal(
            await countMedia({ userId: user.id, apikey: extra.key }),
            2,
        );

        const prefixed = await listMedia({
            userId: user.id,
            apikey: extra.key,
            group: "photos",
        });
        assert.deepEqual(
            prefixed.map((row) => row.mediaId),
            ["media-sealed"],
        );

        const signature = await createSignature({
            userId: user.id,
            apikey: extra.key,
            validTill: new Date(Date.now() - 1000),
        });
        assert.notEqual(await getSignature(signature.signature), null);
        await deleteExpiredSignatures(user.id);
        assert.equal(await getSignature(signature.signature), null);

        await softDeleteApiKey(user.id, extra.keyId);
        assert.equal(await getApiKeyByKeyId(user.id, extra.keyId), null);
        const hidden = await getApiKeyBySecret("plain-secret");
        assert.equal(hidden?.deleted, true);
        assert.equal(hidden?.key, "plain-secret");
    });
});
