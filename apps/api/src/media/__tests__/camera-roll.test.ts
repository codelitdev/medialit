import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import express from "express";
import { FakeS3 } from "./fake-s3";

// These are read when the modules below load, so set them first.
const workDir = mkdtempSync(path.join(tmpdir(), "medialit-camera-roll-"));
const uploadDir = path.join(workDir, "uploads");
const s3 = new FakeS3();
process.env.TEMP_FILE_DIR_FOR_UPLOADS = uploadDir;
process.env.MEDIALIT_DEPLOYMENT_MODE = "oss";
process.env.CLOUD_KEY = "test";
process.env.CLOUD_SECRET = "test";
process.env.CLOUD_REGION = "us-east-1";
process.env.CLOUD_BUCKET_NAME = "private-bucket";
process.env.CLOUD_PUBLIC_BUCKET_NAME = "public-bucket";

let server: Server;
let baseUrl: string;
let secret: string;
let appId: string;
let png: Buffer;

before(async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(uploadDir, "tus-uploads"), { recursive: true });
    await s3.start();
    process.env.CLOUD_ENDPOINT = s3.url;
    process.env.CLOUD_ENDPOINT_PUBLIC = s3.url;
    process.env.CDN_ENDPOINT = `${s3.url}/public-bucket`;

    const schema = await import("../../db/schema/index.js");
    const { setDb, createAccount, listApps } = await import("@/db");
    const { createApiKey } = await import("../../apikey/queries");
    const { default: mediaRoutes } = await import("../routes");
    const { default: tusRoutes } = await import("../../tus/routes");

    const db = drizzle(new PGlite(), { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../drizzle",
        ),
    });
    setDb(db as any);

    const owner = await createAccount({ email: "camera@example.com" });
    const [app] = await listApps(owner.id);
    appId = app.id;
    ({ secret } = await createApiKey({ appId: app.id, name: "Phone" }));

    const pngPath = path.join(workDir, "photo.png");
    execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=green:s=96x54",
        "-frames:v",
        "1",
        pngPath,
    ]);
    png = readFileSync(pngPath);

    const app_ = express();
    app_.use(express.json());
    app_.use("/media", tusRoutes);
    app_.use("/media", mediaRoutes);
    server = app_.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await s3.stop();
});

const auth = () => ({ "x-medialit-apikey": secret });

function upload(fields: Record<string, string>, name = "IMG_0001.png") {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(
        "file",
        new Blob([new Uint8Array(png)], { type: "image/png" }),
        name,
    );
    return fetch(`${baseUrl}/media/create`, {
        method: "POST",
        headers: auth(),
        body: form,
    });
}

function post(pathname: string, body?: unknown) {
    return fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { ...auth(), "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function timeline(query = "") {
    return fetch(`${baseUrl}/media/timeline${query}`, { headers: auth() });
}

const privateKeys = () => s3.keys("private-bucket");
const tempFiles = () =>
    readdirSync(uploadDir).filter((name) => name !== "tus-uploads");

describe("camera roll uploads over REST", () => {
    test("stores the asset ID, capture time and dimensions", async () => {
        const response = await upload({
            assetId: "ios:rest-1",
            takenAt: "2024-05-01T10:00:00.000Z",
        });
        assert.equal(response.status, 200);
        const media = await response.json();
        assert.equal(media.assetId, "ios:rest-1");
        assert.equal(media.takenAt, "2024-05-01T10:00:00.000Z");
        assert.equal(media.width, 96);
        assert.equal(media.height, 54);
        assert.equal(media.durationMs, undefined);
        assert.equal(privateKeys().length, 2, "main file and thumbnail");
    });

    test("refuses the same asset again, leaving nothing behind", async () => {
        const keysBefore = privateKeys();
        const filesBefore = tempFiles();
        const response = await upload({ assetId: "ios:rest-1" });
        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.error, "asset_exists");
        assert.equal(body.sealed, false);
        assert.ok(body.mediaId);
        assert.deepEqual(privateKeys(), keysBefore);
        assert.deepEqual(tempFiles(), filesBefore);
    });

    test("rejects a malformed asset ID or capture time", async () => {
        const filesBefore = tempFiles();
        const invalid: Record<string, string>[] = [
            { assetId: "has spaces" },
            { assetId: "a".repeat(201) },
            { takenAt: "yesterday" },
            { takenAt: "2999-01-01T00:00:00Z" },
        ];
        for (const fields of invalid) {
            const response = await upload(fields);
            assert.equal(response.status, 400, JSON.stringify(fields));
        }
        assert.deepEqual(tempFiles(), filesBefore);
    });

    test("two uploads of one asset at once leave exactly one", async () => {
        const [a, b] = await Promise.all([
            upload({ assetId: "ios:race" }),
            upload({ assetId: "ios:race" }),
        ]);
        assert.deepEqual([a.status, b.status].sort(), [200, 409]);
        const found = await (
            await post("/media/get/assets", { assetIds: ["ios:race"] })
        ).json();
        assert.equal(found.length, 1);
        // Every stored object belongs to a record that exists.
        const records = new Set(
            (
                await (
                    await post("/media/get/assets", {
                        assetIds: ["ios:race", "ios:rest-1"],
                    })
                ).json()
            ).map((row: any) => row.mediaId),
        );
        for (const key of privateKeys()) {
            assert.ok(
                [...records].some((mediaId) => key.includes(String(mediaId))),
                `orphaned object ${key}`,
            );
        }
    });
});

describe("asset lookup", () => {
    test("reports which assets exist and whether they are sealed", async () => {
        const created = await (await upload({ assetId: "ios:lookup" })).json();
        const before = await (
            await post("/media/get/assets", {
                assetIds: ["ios:lookup", "ios:nope"],
            })
        ).json();
        assert.deepEqual(before, [
            { assetId: "ios:lookup", mediaId: created.mediaId, sealed: false },
        ]);

        const seal = await post(`/media/seal/${created.mediaId}`);
        assert.equal(seal.status, 200);
        const after = await (
            await post("/media/get/assets", { assetIds: ["ios:lookup"] })
        ).json();
        assert.equal(after[0].sealed, true);
    });

    test("validates the request", async () => {
        for (const body of [
            {},
            { assetIds: [] },
            { assetIds: "x" },
            { assetIds: ["bad id"] },
            { assetIds: Array.from({ length: 201 }, (_, i) => `a${i}`) },
        ]) {
            assert.equal(
                (await post("/media/get/assets", body)).status,
                400,
                JSON.stringify(body),
            );
        }
    });

    test("needs credentials", async () => {
        const response = await fetch(`${baseUrl}/media/get/assets`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ assetIds: ["x"] }),
        });
        assert.equal(response.status, 401);
    });
});

describe("timeline", () => {
    const seeded: Record<string, string> = {};

    before(async () => {
        // Uploaded in this order, captured in another.
        for (const [assetId, takenAt] of [
            ["tl-old", "2019-01-01T00:00:00.000Z"],
            ["tl-new", "2024-12-31T00:00:00.000Z"],
            ["tl-mid", "2022-06-15T00:00:00.000Z"],
        ]) {
            const media = await (await upload({ assetId, takenAt })).json();
            seeded[assetId] = media.mediaId;
            await post(`/media/seal/${media.mediaId}`);
        }
        // Uploaded but never sealed.
        await upload({
            assetId: "tl-unsealed",
            takenAt: "2025-01-01T00:00:00Z",
        });
    });

    test("lists sealed media, newest capture first", async () => {
        const response = await timeline("?limit=200");
        assert.equal(response.status, 200);
        const page = await response.json();
        const order = page.items
            .map((item: any) => item.assetId)
            .filter((id: string) => id?.startsWith("tl-"));
        assert.deepEqual(order, ["tl-new", "tl-mid", "tl-old"]);
        assert.equal(page.nextCursor, null);
        const item = page.items.find((i: any) => i.assetId === "tl-new");
        assert.equal(item.width, 96);
        assert.equal(item.access, "private");
        assert.equal(item.takenAt, "2024-12-31T00:00:00.000Z");
        assert.ok(item.thumbnail.startsWith("http"));
        assert.ok(item.createdAt);
    });

    test("pages by cursor without repeating or skipping", async () => {
        const all = (await (await timeline("?limit=200")).json()).items.map(
            (item: any) => item.mediaId,
        );
        assert.ok(all.length >= 4);

        const seen: string[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < all.length + 2; page += 1) {
            const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
            const body: any = await (await timeline(query)).json();
            assert.ok(body.items.length <= 2);
            seen.push(...body.items.map((item: any) => item.mediaId));
            cursor = body.nextCursor;
            if (!cursor) break;
        }
        assert.deepEqual(seen, all);
    });

    test("a page boundary survives an upload landing between pages", async () => {
        const first = await (await timeline("?limit=1")).json();
        assert.ok(first.nextCursor);
        const late = await (
            await upload({
                assetId: "tl-late",
                takenAt: "2030-01-01T00:00:00.000Z",
            })
        ).json();
        await post(`/media/seal/${late.mediaId}`);
        const second = await (
            await timeline(
                `?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
            )
        ).json();
        assert.notEqual(second.items[0].mediaId, first.items[0].mediaId);
        assert.notEqual(second.items[0].mediaId, late.mediaId);
    });

    test("filters by kind", async () => {
        const images = await (await timeline("?kind=image&limit=200")).json();
        assert.ok(images.items.length > 0);
        const videos = await (await timeline("?kind=video")).json();
        assert.deepEqual(videos, { items: [], nextCursor: null });
    });

    test("rejects bad parameters", async () => {
        for (const query of [
            "?limit=0",
            "?limit=201",
            "?limit=abc",
            "?cursor=forged",
            "?kind=audio",
        ]) {
            assert.equal((await timeline(query)).status, 400, query);
        }
    });

    test("needs credentials", async () => {
        assert.equal((await fetch(`${baseUrl}/media/timeline`)).status, 401);
    });
});

describe("camera roll uploads over TUS", () => {
    const b64 = (value: string) => Buffer.from(value).toString("base64");

    function createUpload(metadata: Record<string, string>) {
        const header = Object.entries(metadata)
            .map(([key, value]) => `${key} ${b64(value)}`)
            .join(",");
        return fetch(`${baseUrl}/media/create/resumable`, {
            method: "POST",
            headers: {
                ...auth(),
                "tus-resumable": "1.0.0",
                "upload-length": String(png.length),
                "upload-metadata": header,
            },
        });
    }

    async function finish(location: string) {
        return fetch(location, {
            method: "PATCH",
            headers: {
                ...auth(),
                "tus-resumable": "1.0.0",
                "upload-offset": "0",
                "content-type": "application/offset+octet-stream",
            },
            body: new Uint8Array(png),
        });
    }

    const base = (assetId: string) => ({
        fileName: "IMG_9000.png",
        mimeType: "image/png",
        access: "private",
        assetId,
        takenAt: "2023-03-03T03:03:03.000Z",
    });

    test("carries the asset ID and capture time into the media", async () => {
        const created = await createUpload(base("ios:tus-1"));
        assert.equal(created.status, 201);
        const done = await finish(created.headers.get("location")!);
        assert.equal(done.status, 204);
        const media = JSON.parse(done.headers.get("media")!);
        assert.equal(media.assetId, "ios:tus-1");
        assert.equal(media.takenAt, "2023-03-03T03:03:03.000Z");
        assert.equal(media.width, 96);
    });

    test("refuses a known asset before any bytes are sent", async () => {
        const response = await createUpload(base("ios:tus-1"));
        assert.equal(response.status, 409);
        const body = JSON.parse(await response.text());
        assert.equal(body.error, "asset_exists");
        assert.equal(body.sealed, false);
        assert.ok(body.mediaId);
    });

    test("rejects bad metadata", async () => {
        assert.equal((await createUpload({ ...base("bad id") })).status, 400);
        assert.equal(
            (await createUpload({ ...base("ios:tus-2"), takenAt: "nope" }))
                .status,
            400,
        );
    });

    test("still takes uploads that carry no asset ID", async () => {
        const { assetId, takenAt, ...plain } = base("x");
        void assetId;
        void takenAt;
        const created = await createUpload(plain);
        assert.equal(created.status, 201);
        const done = await finish(created.headers.get("location")!);
        assert.equal(done.status, 204);
        const media = JSON.parse(done.headers.get("media")!);
        assert.equal(media.assetId, undefined);
        assert.equal(media.takenAt, undefined);
    });
});

describe("the asset ID backstop", () => {
    test("removes what a losing upload stored", async () => {
        const { createMediaForAsset } = await import("../service");
        const { AssetExistsError } = await import("../errors");
        const { default: generateKey } = await import("../utils/generate-key");
        const { Constants } = await import("@medialit/models");
        const { listApps, findUserByEmail } = await import("@/db");

        const owner = (await findUserByEmail("camera@example.com"))!;
        const [app] = await listApps(owner.id);
        const winner = await (await upload({ assetId: "ios:backstop" })).json();

        // The loser got past the pre-check and already stored its objects.
        const mainKey = generateKey({
            mediaId: "loser",
            path: Constants.PathKey.PRIVATE,
            filename: "main.png",
        });
        const thumbKey = generateKey({
            mediaId: "loser",
            path: Constants.PathKey.PRIVATE,
            filename: "thumb.webp",
        });
        s3.objects.set(`private-bucket/${mainKey}`, Buffer.from("x"));
        s3.objects.set(`private-bucket/${thumbKey}`, Buffer.from("x"));

        await assert.rejects(
            createMediaForAsset(
                {
                    fileName: "main.png",
                    mediaId: "loser",
                    userId: owner.id,
                    appId: app.id,
                    originalFileName: "IMG.png",
                    mimeType: "image/png",
                    size: 1,
                    thumbnailGenerated: true,
                    accessControl: Constants.AccessControl.PRIVATE,
                    temp: true,
                    assetId: "ios:backstop",
                },
                {
                    userId: owner.id,
                    appId: app.id,
                    mediaId: "loser",
                    fileName: "main.png",
                    thumbnailGenerated: true,
                },
            ),
            (error: unknown) =>
                error instanceof AssetExistsError &&
                error.mediaId === winner.mediaId &&
                error.sealed === false,
        );
        assert.equal(privateKeys().includes(mainKey), false);
        assert.equal(privateKeys().includes(thumbKey), false);
        // The winner's own objects are untouched.
        assert.ok(privateKeys().some((key) => key.includes(winner.mediaId)));
    });
});
