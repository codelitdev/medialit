import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Server } from "node:http";
import { after, afterEach, before, describe, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import express, {
    type NextFunction,
    type Request,
    type Response,
} from "express";
import {
    createAccount,
    createApiKey,
    createMediaRecord,
    getMediaRecord,
    getSignature,
    setDb,
    type AccountUser,
    type ApiKeyRecord,
    type AppDb,
} from "@/db";
import * as schema from "../db/schema/index.js";
import type { MedialitAuth } from "../auth/better-auth";
import mediaService from "../media/service";
import { mediaKind } from "../media/kind";
import { createDashboardRouter } from "./routes";

const PUBLIC_API_URL = "https://api.example.test";

/* Sessions come from a test header instead of a cookie. */
const fakeAuth = {
    auth: {
        api: {
            getSession: async ({ headers }: { headers: Headers }) => {
                const userId = headers.get("x-test-user");
                return userId ? { user: { id: userId } } : null;
            },
        },
    },
    publicApiUrl: PUBLIC_API_URL,
} as unknown as MedialitAuth;

let server: Server;
let baseUrl: string;
let owner: AccountUser;
let stranger: AccountUser;
let ownerApp: ApiKeyRecord;
let strangerApp: ApiKeyRecord;

/* Covers every kind, including the mixed-case types the old SQL missed. */
const ownerFiles = [
    { mediaId: "img-png", mimeType: "image/png", size: 100 },
    { mediaId: "img-upper", mimeType: "IMAGE/JPEG", size: 200 },
    { mediaId: "vid-mp4", mimeType: "video/mp4", size: 1000 },
    { mediaId: "pdf-lower", mimeType: "application/pdf", size: 300 },
    { mediaId: "pdf-upper", mimeType: "application/PDF", size: 400 },
    { mediaId: "audio-mp3", mimeType: "audio/mpeg", size: 50 },
    { mediaId: "text-plain", mimeType: "text/plain", size: 5 },
];

async function addMedia(
    user: AccountUser,
    app: ApiKeyRecord,
    file: { mediaId: string; mimeType: string; size: number },
    options: { temp?: boolean; access?: "public" | "private" } = {},
) {
    await createMediaRecord({
        fileName: `${file.mediaId}.bin`,
        mediaId: file.mediaId,
        userId: user.id,
        apikey: app.key,
        originalFileName: `${file.mediaId}.bin`,
        mimeType: file.mimeType,
        size: file.size,
        thumbnailGenerated: false,
        accessControl: options.access ?? "public",
        temp: options.temp ?? false,
    });
}

function call(
    method: string,
    route: string,
    options: { user?: AccountUser | null; body?: unknown } = {},
) {
    const user = options.user === undefined ? owner : options.user;
    const headers: Record<string, string> = {};
    if (user) headers["x-test-user"] = user.id;
    if (options.body !== undefined)
        headers["content-type"] = "application/json";
    return fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body:
            options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
    });
}

async function json(
    method: string,
    route: string,
    options: { user?: AccountUser | null; body?: unknown } = {},
) {
    const response = await call(method, route, options);
    return { status: response.status, body: await response.json() };
}

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

    owner = await createAccount({ email: "owner@example.com" });
    stranger = await createAccount({ email: "stranger@example.com" });
    ownerApp = await createApiKey({ userId: owner.id, name: "Photos" });
    strangerApp = await createApiKey({ userId: stranger.id, name: "Theirs" });

    for (const file of ownerFiles) await addMedia(owner, ownerApp, file);
    // Temporary uploads never count.
    await addMedia(
        owner,
        ownerApp,
        { mediaId: "temp-png", mimeType: "image/png", size: 9999 },
        { temp: true },
    );
    await addMedia(stranger, strangerApp, {
        mediaId: "stranger-png",
        mimeType: "image/png",
        size: 700,
    });

    const app = express();
    app.use(express.json());
    app.use(createDashboardRouter(fakeAuth));
    app.use(
        (error: Error, _req: Request, res: Response, _next: NextFunction) => {
            res.status(500).json({ error: error.message });
        },
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
    mock.restoreAll();
});

describe("dashboard routes: session and ownership", () => {
    test("rejects requests without a session", async () => {
        for (const route of [
            "/api/account",
            "/api/apps",
            "/api/apps/overview",
            `/api/apps/${ownerApp.keyId}/media`,
        ]) {
            const response = await call("GET", route, { user: null });
            assert.equal(response.status, 401, route);
        }
        const signature = await call(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/signature`,
            { user: null, body: {} },
        );
        assert.equal(signature.status, 401);
    });

    test("hides another user's app", async () => {
        const keyId = strangerApp.keyId;
        const attempts: Array<[string, string, unknown?]> = [
            ["GET", `/api/apps/${keyId}`],
            ["GET", `/api/apps/${keyId}/summary`],
            ["GET", `/api/apps/${keyId}/media`],
            ["GET", `/api/apps/${keyId}/media/count`],
            ["GET", `/api/apps/${keyId}/media/stranger-png`],
            ["POST", `/api/apps/${keyId}/media/signature`, {}],
            ["POST", `/api/apps/${keyId}/media/stranger-png/seal`, {}],
            [
                "POST",
                `/api/apps/${keyId}/media/delete`,
                { mediaIds: ["stranger-png"] },
            ],
        ];
        for (const [method, route, body] of attempts) {
            const response = await json(method, route, { body });
            assert.equal(response.status, 404, `${method} ${route}`);
            assert.equal(response.body.error, "Apikey not found");
        }
        assert.notEqual(
            await getMediaRecord({
                userId: stranger.id,
                apikey: strangerApp.key,
                mediaId: "stranger-png",
            }),
            null,
        );
    });
});

describe("dashboard routes: summaries", () => {
    test("counts each kind once, whatever the type's case", async () => {
        const { status, body } = await json(
            "GET",
            `/api/apps/${ownerApp.keyId}/summary`,
        );
        assert.equal(status, 200);
        assert.equal(body.count, 7);
        assert.equal(body.images, 2);
        assert.equal(body.videos, 1);
        assert.equal(body.pdfs, 2);
        assert.equal(body.others, 2);
        assert.equal(body.imageStorage, 300);
        assert.equal(body.videoStorage, 1000);
        assert.equal(body.pdfStorage, 700);
        assert.equal(body.otherStorage, 55);
        assert.equal(
            body.imageStorage +
                body.videoStorage +
                body.pdfStorage +
                body.otherStorage,
            body.storage,
        );
        assert.equal(body.share, 100);
    });

    test("overview totals match the per-app summaries", async () => {
        const { status, body } = await json("GET", "/api/apps/overview");
        assert.equal(status, 200);
        assert.equal(body.appCount, 2); // Photos and the default app
        const photos = body.apps.find(
            (app: { keyId: string }) => app.keyId === ownerApp.keyId,
        );
        const summary = await json(
            "GET",
            `/api/apps/${ownerApp.keyId}/summary`,
        );
        assert.deepEqual(photos, summary.body);
        assert.equal(body.totalOthers, 2);
        assert.equal(body.largestApp.keyId, ownerApp.keyId);
    });
});

describe("dashboard routes: media list", () => {
    test("tags each file with the kind the filters use", async () => {
        const { status, body } = await json(
            "GET",
            `/api/apps/${ownerApp.keyId}/media?limit=100`,
        );
        assert.equal(status, 200);
        assert.equal(body.length, 7);
        for (const item of body) {
            assert.equal(item.kind, mediaKind(item.mimeType), item.mediaId);
        }

        for (const kind of ["image", "video", "pdf", "other"]) {
            const list = await json(
                "GET",
                `/api/apps/${ownerApp.keyId}/media?limit=100&kind=${kind}`,
            );
            const count = await json(
                "GET",
                `/api/apps/${ownerApp.keyId}/media/count?kind=${kind}`,
            );
            assert.ok(
                list.body.every((item: { kind: string }) => item.kind === kind),
                kind,
            );
            assert.equal(count.body.count, list.body.length, kind);
        }
    });

    test("rejects a bad page or page size", async () => {
        for (const query of [
            "page=-1",
            "page=0",
            "page=1.5",
            "page=abc",
            "limit=0",
            "limit=101",
            "limit=-5",
        ]) {
            const response = await call(
                "GET",
                `/api/apps/${ownerApp.keyId}/media?${query}`,
            );
            assert.equal(response.status, 400, query);
        }
        const largest = await json(
            "GET",
            `/api/apps/${ownerApp.keyId}/media?page=2&limit=3&sort=largest`,
        );
        assert.equal(largest.status, 200);
        assert.deepEqual(
            largest.body.map((item: { mediaId: string }) => item.mediaId),
            ["img-upper", "img-png", "audio-mp3"],
        );
    });

    test("returns one file with its kind", async () => {
        const { status, body } = await json(
            "GET",
            `/api/apps/${ownerApp.keyId}/media/pdf-upper`,
        );
        assert.equal(status, 200);
        assert.equal(body.kind, "pdf");
        assert.ok(body.file);
    });
});

describe("dashboard routes: uploads", () => {
    test("issues a signature bound to the app, with the upload endpoint", async () => {
        const { status, body } = await json(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/signature`,
            { body: { group: "avatars" } },
        );
        assert.equal(status, 200);
        assert.equal(body.endpoint, PUBLIC_API_URL);
        const stored = await getSignature(body.signature);
        assert.equal(stored?.apikey, ownerApp.key);
        assert.equal(stored?.userId, owner.id);
        assert.equal(stored?.group, "avatars");
    });

    test("rejects a signature with a bad group", async () => {
        const response = await call(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/signature`,
            { body: { group: 42 } },
        );
        assert.equal(response.status, 400);
    });

    test("seals through the media service and maps its errors", async () => {
        const missing = await json(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/no-such-media/seal`,
            { body: {} },
        );
        assert.equal(missing.status, 404);
        assert.equal(missing.body.error, "Media not found");

        const seal = mock.method(mediaService, "sealMedia", async () => ({
            mediaId: "temp-png",
            originalFileName: "temp-png.bin",
            mimeType: "image/png",
            size: 9999,
            access: "public",
            file: "https://files.example.test/temp-png",
            thumbnail: "",
        }));
        const sealed = await json(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/temp-png/seal`,
            { body: {} },
        );
        assert.equal(sealed.status, 200);
        assert.equal(sealed.body.kind, "image");
        assert.deepEqual(seal.mock.calls[0].arguments[0], {
            userId: owner.id,
            apikey: ownerApp.key,
            mediaId: "temp-png",
        });
    });
});

describe("dashboard routes: bulk delete", () => {
    test("validates the id list", async () => {
        for (const mediaIds of [
            [],
            [""],
            [42],
            "img-png",
            Array.from({ length: 101 }, (_, index) => `id-${index}`),
        ]) {
            const response = await call(
                "POST",
                `/api/apps/${ownerApp.keyId}/media/delete`,
                { body: { mediaIds } },
            );
            assert.equal(response.status, 400, JSON.stringify(mediaIds));
        }
    });

    test("deletes what it finds and counts the rest as failed", async () => {
        const removed: string[] = [];
        mock.method(
            mediaService,
            "removeStoredFiles",
            async (media: { mediaId: string }) => {
                if (media.mediaId === "audio-mp3") {
                    throw new Error("storage unavailable");
                }
                removed.push(media.mediaId);
            },
        );

        const { status, body } = await json(
            "POST",
            `/api/apps/${ownerApp.keyId}/media/delete`,
            {
                body: {
                    mediaIds: [
                        "text-plain",
                        "text-plain", // duplicates count once
                        "audio-mp3", // storage fails
                        "stranger-png", // another user's file
                        "no-such-media",
                    ],
                },
            },
        );
        assert.equal(status, 200);
        assert.deepEqual(body, { deleted: 1, failed: 3 });
        assert.deepEqual(removed, ["text-plain"]);

        const lookup = (userId: string, apikey: string, mediaId: string) =>
            getMediaRecord({ userId, apikey, mediaId });
        assert.equal(await lookup(owner.id, ownerApp.key, "text-plain"), null);
        assert.notEqual(
            await lookup(owner.id, ownerApp.key, "audio-mp3"),
            null,
        );
        assert.notEqual(
            await lookup(stranger.id, strangerApp.key, "stranger-png"),
            null,
        );
    });
});
