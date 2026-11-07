import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb, type AppDb } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MEDIALIT_DEPLOYMENT_MODE = "oss";

let handleUploadMediaTool: typeof import("../upload.js").handleUploadMediaTool;
let mediaService: typeof import("../../../media/service.js").default;

before(async () => {
    ({ handleUploadMediaTool } = await import("../upload.js"));
    ({ default: mediaService } = await import("../../../media/service.js"));
    // The size/storage check reads totals from the database.
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);
});

const PNG_BASE64 = Buffer.from("not-really-a-png").toString("base64");

function context() {
    return {
        authKind: "apikey" as const,
        userId: "user-1",
        user: { _id: "user-1" },
        appId: "app-1",
        scopes: ["data:read", "data:write"],
    };
}

async function uploadWithFileName(fileName: string) {
    const seen: { body: Buffer; fileName: string; mimeType: string }[] = [];
    const upload = mediaService.upload;
    const getMediaDetails = mediaService.getMediaDetails;
    (mediaService as any).upload = async (props: any) => {
        seen.push({
            body: props.body,
            fileName: props.fileName,
            mimeType: props.mimeType,
        });
        return "media-1";
    };
    (mediaService as any).getMediaDetails = async () => ({
        mediaId: "media-1",
    });
    try {
        const result = await handleUploadMediaTool({
            context: context(),
            args: {
                fileBase64: PNG_BASE64,
                fileName,
                mimeType: "image/png",
            },
        });
        return { result, seen };
    } finally {
        (mediaService as any).upload = upload;
        (mediaService as any).getMediaDetails = getMediaDetails;
    }
}

test("upload_media streams the decoded file without writing it to disk", async () => {
    const marker = `mcp-traversal-${process.pid}-${Date.now()}`;
    const { result, seen } = await uploadWithFileName(`../${marker}`);

    assert.notEqual((result as any).isError, true);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].body, Buffer.from("not-really-a-png"));
    assert.equal(seen[0].fileName, `../${marker}`);
    assert.equal(seen[0].mimeType, "image/png");
    assert.equal(existsSync(path.join(os.tmpdir(), marker)), false);
});

test("hostile file names still get a key inside the upload's own folder", async () => {
    const { newUploadTarget, parseUploadKey } = await import(
        "../../../media/ingest.js"
    );
    for (const fileName of [
        "../escape.txt",
        "/tmp/mcp-abs-escape.txt",
        "a/b/c.txt",
        "..\\..\\win.txt",
        "photo.png;rm -rf",
    ]) {
        const target = newUploadTarget(fileName);
        assert.deepEqual(parseUploadKey(target.key), target, fileName);
        assert.ok(!target.key.includes(".."), fileName);
    }
});
