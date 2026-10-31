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

function authExtra() {
    return {
        authInfo: {
            token: "t",
            clientId: "c",
            scopes: ["data:write"],
            extra: {
                authKind: "apikey",
                userId: "user-1",
                user: { _id: "user-1" },
                appId: "app-1",
            },
        },
    };
}

async function uploadWithFileName(fileName: string) {
    const seen: { tempFilePath: string; existed: boolean; name: string }[] = [];
    const upload = mediaService.upload;
    const getMediaDetails = mediaService.getMediaDetails;
    (mediaService as any).upload = async ({ file }: any) => {
        seen.push({
            tempFilePath: file.tempFilePath,
            existed: existsSync(file.tempFilePath),
            name: file.name,
        });
        return "media-1";
    };
    (mediaService as any).getMediaDetails = async () => ({
        mediaId: "media-1",
    });
    try {
        const result = await handleUploadMediaTool(
            {
                fileBase64: PNG_BASE64,
                fileName,
                mimeType: "image/png",
            },
            authExtra(),
        );
        return { result, seen };
    } finally {
        (mediaService as any).upload = upload;
        (mediaService as any).getMediaDetails = getMediaDetails;
    }
}

test("upload_media keeps the temp file inside its own temp directory", async () => {
    const marker = `mcp-traversal-${process.pid}-${Date.now()}`;
    const escaped = path.join(os.tmpdir(), marker);

    const { result, seen } = await uploadWithFileName(`../${marker}`);

    assert.notEqual((result as any).isError, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].existed, true);
    const tempDir = path.dirname(seen[0].tempFilePath);
    assert.ok(path.basename(tempDir).startsWith("mcp-upload-"));
    assert.equal(path.dirname(tempDir), path.resolve(os.tmpdir()));
    assert.equal(existsSync(escaped), false);
});

test("upload_media handles absolute and nested file names without writing elsewhere", async () => {
    for (const fileName of [
        "/tmp/mcp-abs-escape.txt",
        "a/b/c.txt",
        "..\\..\\win.txt",
    ]) {
        const { result, seen } = await uploadWithFileName(fileName);
        assert.notEqual((result as any).isError, true, fileName);
        assert.equal(
            path.dirname(path.dirname(seen[0].tempFilePath)),
            path.resolve(os.tmpdir()),
            fileName,
        );
    }
    assert.equal(existsSync("/tmp/mcp-abs-escape.txt"), false);
});

test("upload_media cleans up its temp directory", async () => {
    const { seen } = await uploadWithFileName("photo.png");
    // Cleanup is fire-and-forget.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(existsSync(path.dirname(seen[0].tempFilePath)), false);
});
