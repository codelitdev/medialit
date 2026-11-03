import { before, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb, type AppDb } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";
import {
    createAccount,
    createApp,
    createMediaRecord,
} from "../../db/repository.js";
import { billingStateSource } from "../../billing/entitlements.js";
import { maxStorageAllowedNotSubscribed } from "../../config/constants.js";
import { validateUploadConstraints } from "../storage-middleware.js";
import mediaService from "../service.js";

// Quota is enforced in cloud mode only.
process.env.MEDIALIT_DEPLOYMENT_MODE = "cloud";

before(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);
    // No paid plan: the account gets the free storage limit.
    billingStateSource.read = async () => null;
});

async function accountWithTempUpload(email: string, size: number) {
    const user = await createAccount({ email, name: email });
    const app = await createApp({ userId: user.id, name: "app" });
    await createMediaRecord({
        fileName: "objects/a",
        mediaId: `media-${email}`,
        userId: user.id,
        appId: app.id,
        originalFileName: "a.bin",
        mimeType: "application/octet-stream",
        size,
        thumbnailGenerated: false,
        accessControl: "private",
        temp: true,
    });
    return { user, app };
}

test("unsealed uploads count against the storage quota", async () => {
    const limit = maxStorageAllowedNotSubscribed;
    const { user } = await accountWithTempUpload("a@example.com", limit - 5);
    const uploadUser = { ...user, _id: user.id } as any;

    const tooBig = await validateUploadConstraints({
        size: 10,
        user: uploadUser,
    });
    assert.equal(tooBig.valid, false);
    assert.equal((tooBig as any).reason, "not_enough_storage");

    const fits = await validateUploadConstraints({ size: 5, user: uploadUser });
    assert.equal(fits.valid, true);
});

test("sealing is refused when the account is over its quota", async () => {
    const limit = maxStorageAllowedNotSubscribed;
    const { user, app } = await accountWithTempUpload(
        "b@example.com",
        limit + 1,
    );

    await assert.rejects(
        mediaService.sealMedia({
            userId: user.id,
            appId: app.id,
            mediaId: "media-b@example.com",
        }),
        /Not enough storage/,
    );
});
