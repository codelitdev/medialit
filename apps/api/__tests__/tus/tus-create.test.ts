import { before, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

process.env.MEDIALIT_DEPLOYMENT_MODE = "oss";

let appId: string;
let userId: string;

before(async () => {
    const schema = await import("../../src/db/schema/index.js");
    const { setDb, createAccount, listApps } = await import("@/db");
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../drizzle",
        ),
    });
    setDb(db as any);
    const owner = await createAccount({ email: "tus@example.com" });
    userId = owner.id;
    [{ id: appId }] = await listApps(owner.id);
});

test("records the media ID and sets the object's content type", async () => {
    const { handleTusUploadCreate } = await import("../../src/tus/tus-server");
    const { newUploadTarget } = await import("../../src/media/ingest");
    const { getTusUpload } = await import("../../src/tus/queries");

    const target = newUploadTarget("clip.mp4");
    const result = await handleTusUploadCreate(
        {
            user: { id: userId, _id: userId },
            appId,
            group: "signed-group",
            signature: "sig-1",
        },
        {
            id: target.key,
            size: 1234,
            metadata: {
                fileName: "clip.mp4",
                mimeType: "video/mp4",
                access: "public",
                group: "client-group",
            },
        },
    );

    assert.equal(result.metadata.contentType, "video/mp4");
    assert.equal(result.metadata.fileName, "clip.mp4");

    const row = await getTusUpload(target.key);
    assert.ok(row);
    assert.equal(row.mediaId, target.mediaId);
    assert.equal(row.uploadLength, 1234);
    assert.equal(row.signature, "sig-1");
    assert.equal(row.isComplete, false);
    assert.deepEqual(row.metadata, {
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        accessControl: "public",
        caption: undefined,
        group: "signed-group",
    });
});
