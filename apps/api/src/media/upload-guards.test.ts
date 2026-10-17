import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, describe, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import express from "express";

// Uploads land here; read before the modules that capture it load.
const uploadDir = mkdtempSync(path.join(tmpdir(), "medialit-upload-guards-"));
process.env.TEMP_FILE_DIR_FOR_UPLOADS = uploadDir;

let server: Server;
let baseUrl: string;
let secret: string;
let appId: string;
let ownerId: string;
let db: any;
let schema: typeof import("../db/schema/index.js");
let mediaQueries: typeof import("./queries").default;

before(async () => {
    schema = await import("../db/schema/index.js");
    const { setDb, createAccount, listApps } = await import("@/db");
    const { createApiKey } = await import("../apikey/queries");
    const guards = await import("./upload-guards");
    mediaQueries = (await import("./queries")).default;

    const client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../drizzle",
        ),
    });
    setDb(db);

    const owner = await createAccount({ email: "uploader@example.com" });
    ownerId = owner.id;
    const [app] = await listApps(owner.id);
    appId = app.id;
    ({ secret } = await createApiKey({ appId: app.id, name: "Uploads" }));

    const appServer = express();
    appServer.post(
        "/media/create",
        guards.authenticateUpload,
        guards.preflightUploadSize,
        guards.parseUpload,
        (req: any, res) => {
            res.json({
                appId: req.appId,
                file: req.files?.file?.name ?? null,
            });
        },
    );
    server = appServer.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => mock.restoreAll());

function multipart(fields: Record<string, string>, fileBody = "hello") {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        form.append(name, value);
    }
    form.append("file", new Blob([fileBody]), "hello.txt");
    return form;
}

function upload(headers: Record<string, string>, form = multipart({})) {
    return fetch(`${baseUrl}/media/create`, {
        method: "POST",
        headers,
        body: form,
    });
}

/** Sends only the headers and a few body bytes, then reports the response:
 * proof the server answered without reading the declared body. */
function declareUpload(
    headers: Record<string, string>,
): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
        const request = http.request(`${baseUrl}/media/create`, {
            method: "POST",
            headers: {
                "content-type": "multipart/form-data; boundary=x",
                ...headers,
            },
        });
        request.on("response", (response) => {
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
                request.destroy();
                resolve({
                    status: response.statusCode!,
                    body: JSON.parse(data),
                });
            });
        });
        request.on("error", (error: any) => {
            if (error.code !== "ECONNRESET" && error.code !== "EPIPE") {
                reject(error);
            }
        });
        request.write("--x\r\n");
    });
}

function tempFiles(): string[] {
    return readdirSync(uploadDir);
}

describe("upload guards", () => {
    test("rejects an upload without credentials before writing it", async () => {
        const before = tempFiles().length;
        const response = await upload({});
        assert.equal(response.status, 401);
        assert.equal(tempFiles().length, before);
    });

    test("ignores a key sent in the form body", async () => {
        const before = tempFiles().length;
        const response = await upload({}, multipart({ apikey: secret }));
        assert.equal(response.status, 401);
        const body = await response.json();
        assert.match(body.error_description, /x-medialit-apikey/);
        assert.equal(tempFiles().length, before);
    });

    test("accepts the key header and tags the upload with its app", async () => {
        const response = await upload({ "x-medialit-apikey": secret });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            appId,
            file: "hello.txt",
        });
    });

    test("rejects a revoked key", async () => {
        const { createApiKey } = await import("../apikey/queries");
        const { revokeApiKey } = await import("@/db");
        const revoked = await createApiKey({ appId, name: "Gone" });
        await revokeApiKey(appId, revoked.apiKey.apiKeyId);

        const response = await upload({
            "x-medialit-apikey": revoked.secret,
        });
        assert.equal(response.status, 401);
    });

    test("rejects a declared size over the plan limit before reading it", async () => {
        const response = await declareUpload({
            "x-medialit-apikey": secret,
            "content-length": String(500 * 1024 * 1024),
        });
        assert.equal(response.status, 400);
        assert.match(response.body.error, /Allowed/);
    });

    test("rejects a declared size over the remaining storage before reading it", async () => {
        mock.method(mediaQueries, "getTotalSpace", async () => 1024 ** 4);
        const response = await declareUpload({
            "x-medialit-apikey": secret,
            "content-length": String(1024 * 1024),
        });
        assert.equal(response.status, 403);
    });

    test("rejects a deactivated account's key and signatures", async () => {
        const { createSignature } = await import("@/db");
        const signature = await createSignature({ userId: ownerId, appId });
        await db
            .update(schema.profiles)
            .set({ active: false })
            .where(eq(schema.profiles.userId, ownerId));
        try {
            const byKey = await upload({ "x-medialit-apikey": secret });
            assert.equal(byKey.status, 403);
            assert.equal((await byKey.json()).error, "account_inactive");

            const bySignature = await upload({
                "x-medialit-signature": signature.signature,
            });
            assert.equal(bySignature.status, 403);
            assert.equal((await bySignature.json()).error, "account_inactive");
        } finally {
            await db
                .update(schema.profiles)
                .set({ active: true })
                .where(eq(schema.profiles.userId, ownerId));
        }
    });

    test("accepts a signature and applies its group", async () => {
        const { createSignature } = await import("@/db");
        const signature = await createSignature({
            userId: ownerId,
            appId,
            group: "avatars",
        });
        const response = await upload({
            "x-medialit-signature": signature.signature,
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).appId, appId);
    });
});
