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
    createApp,
    createMediaRecord,
    findApiKeyByHash,
    getMediaRecord,
    getSignature,
    listApps,
    setDb,
    syncBootstrapApiKey,
    type AccountUser,
    type AppDb,
    type AppRecord,
} from "@/db";
import { getApiKeyBySecret } from "../apikey/queries";
import { hashApiKeySecret } from "../apikey/secret";
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
let ownerApp: AppRecord;
let strangerApp: AppRecord;

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
    app: AppRecord,
    file: { mediaId: string; mimeType: string; size: number },
    options: { temp?: boolean; access?: "public" | "private" } = {},
) {
    await createMediaRecord({
        fileName: `${file.mediaId}.bin`,
        mediaId: file.mediaId,
        userId: user.id,
        appId: app.id,
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
    ownerApp = await createApp({ userId: owner.id, name: "Photos" });
    strangerApp = await createApp({ userId: stranger.id, name: "Theirs" });

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
            `/api/apps/${ownerApp.appId}/media`,
        ]) {
            const response = await call("GET", route, { user: null });
            assert.equal(response.status, 401, route);
        }
        const signature = await call(
            "POST",
            `/api/apps/${ownerApp.appId}/media/signature`,
            { user: null, body: {} },
        );
        assert.equal(signature.status, 401);
    });

    test("hides another user's app", async () => {
        const appId = strangerApp.appId;
        const attempts: Array<[string, string, unknown?]> = [
            ["GET", `/api/apps/${appId}`],
            ["GET", `/api/apps/${appId}/summary`],
            ["GET", `/api/apps/${appId}/media`],
            ["GET", `/api/apps/${appId}/media/count`],
            ["GET", `/api/apps/${appId}/media/stranger-png`],
            ["POST", `/api/apps/${appId}/media/signature`, {}],
            ["POST", `/api/apps/${appId}/media/stranger-png/seal`, {}],
            ["GET", `/api/apps/${appId}/keys`],
            ["POST", `/api/apps/${appId}/keys`, { name: "Sneaky" }],
            ["DELETE", `/api/apps/${appId}/keys/ak_anything`],
            [
                "POST",
                `/api/apps/${appId}/media/delete`,
                { mediaIds: ["stranger-png"] },
            ],
        ];
        for (const [method, route, body] of attempts) {
            const response = await json(method, route, { body });
            assert.equal(response.status, 404, `${method} ${route}`);
            assert.equal(response.body.error, "App not found");
        }
        assert.notEqual(
            await getMediaRecord({
                userId: stranger.id,
                appId: strangerApp.id,
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
            `/api/apps/${ownerApp.appId}/summary`,
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
            (app: { appId: string }) => app.appId === ownerApp.appId,
        );
        const summary = await json(
            "GET",
            `/api/apps/${ownerApp.appId}/summary`,
        );
        assert.deepEqual(photos, summary.body);
        assert.equal(body.totalOthers, 2);
        assert.equal(body.largestApp.appId, ownerApp.appId);
    });
});

describe("dashboard routes: media list", () => {
    test("tags each file with the kind the filters use", async () => {
        const { status, body } = await json(
            "GET",
            `/api/apps/${ownerApp.appId}/media?limit=100`,
        );
        assert.equal(status, 200);
        assert.equal(body.length, 7);
        for (const item of body) {
            assert.equal(item.kind, mediaKind(item.mimeType), item.mediaId);
        }

        for (const kind of ["image", "video", "pdf", "other"]) {
            const list = await json(
                "GET",
                `/api/apps/${ownerApp.appId}/media?limit=100&kind=${kind}`,
            );
            const count = await json(
                "GET",
                `/api/apps/${ownerApp.appId}/media/count?kind=${kind}`,
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
                `/api/apps/${ownerApp.appId}/media?${query}`,
            );
            assert.equal(response.status, 400, query);
        }
        const largest = await json(
            "GET",
            `/api/apps/${ownerApp.appId}/media?page=2&limit=3&sort=largest`,
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
            `/api/apps/${ownerApp.appId}/media/pdf-upper`,
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
            `/api/apps/${ownerApp.appId}/media/signature`,
            { body: { group: "avatars" } },
        );
        assert.equal(status, 200);
        assert.equal(body.endpoint, PUBLIC_API_URL);
        const stored = await getSignature(body.signature);
        assert.equal(stored?.appId, ownerApp.id);
        assert.equal(stored?.apiKeyId, undefined);
        assert.equal(stored?.userId, owner.id);
        assert.equal(stored?.group, "avatars");
    });

    test("rejects a signature with a bad group", async () => {
        const response = await call(
            "POST",
            `/api/apps/${ownerApp.appId}/media/signature`,
            { body: { group: 42 } },
        );
        assert.equal(response.status, 400);
    });

    test("seals through the media service and maps its errors", async () => {
        const missing = await json(
            "POST",
            `/api/apps/${ownerApp.appId}/media/no-such-media/seal`,
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
            `/api/apps/${ownerApp.appId}/media/temp-png/seal`,
            { body: {} },
        );
        assert.equal(sealed.status, 200);
        assert.equal(sealed.body.kind, "image");
        assert.deepEqual(seal.mock.calls[0].arguments[0], {
            userId: owner.id,
            appId: ownerApp.id,
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
                `/api/apps/${ownerApp.appId}/media/delete`,
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
            `/api/apps/${ownerApp.appId}/media/delete`,
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

        const lookup = (userId: string, appId: string, mediaId: string) =>
            getMediaRecord({ userId, appId, mediaId });
        assert.equal(await lookup(owner.id, ownerApp.id, "text-plain"), null);
        assert.notEqual(await lookup(owner.id, ownerApp.id, "audio-mp3"), null);
        assert.notEqual(
            await lookup(stranger.id, strangerApp.id, "stranger-png"),
            null,
        );
    });
});

describe("dashboard routes: apps", () => {
    test("never returns internal IDs or secrets for an app", async () => {
        const { status, body } = await json(
            "GET",
            `/api/apps/${ownerApp.appId}`,
        );
        assert.equal(status, 200);
        assert.deepEqual(body, {
            appId: ownerApp.appId,
            name: "Photos",
            default: false,
        });
    });

    test("creating an app returns its first key once", async () => {
        const { status, body } = await json("POST", "/api/apps", {
            body: { name: "Fresh" },
        });
        assert.equal(status, 201);
        assert.equal(body.name, "Fresh");
        assert.match(body.key, /^ml_live_/);
        assert.equal(body.apiKey.keyPrefix, body.key.slice(0, 12));
        const found = await getApiKeyBySecret(body.key);
        assert.equal(found?.app.appId, body.appId);

        const keys = await json("GET", `/api/apps/${body.appId}/keys`);
        assert.equal(JSON.stringify(keys.body).includes(body.key), false);
    });

    test("deleting an app revokes its keys", async () => {
        const created = await json("POST", "/api/apps", {
            body: { name: "Short-lived" },
        });
        const deleted = await call("DELETE", `/api/apps/${created.body.appId}`);
        assert.equal(deleted.status, 200);
        assert.equal(await getApiKeyBySecret(created.body.key), null);
    });
});

describe("dashboard routes: API keys", () => {
    const freshApp = (name: string) => createApp({ userId: owner.id, name });

    test("creates, lists and revokes keys", async () => {
        const app = await freshApp("Keys");
        const created = await json("POST", `/api/apps/${app.appId}/keys`, {
            body: { name: "Server" },
        });
        assert.equal(created.status, 201);
        assert.match(created.body.key, /^ml_live_/);
        assert.match(created.body.keyId, /^ak_/);
        assert.equal(created.body.name, "Server");
        assert.equal(created.body.lastUsedAt, null);
        assert.equal(created.body.managedByConfiguration, false);

        const listed = await json("GET", `/api/apps/${app.appId}/keys`);
        assert.equal(listed.status, 200);
        assert.deepEqual(
            listed.body.items.map((key: { keyId: string }) => key.keyId),
            [created.body.keyId],
        );
        assert.equal(listed.body.items[0].key, undefined);

        const revoked = await call(
            "DELETE",
            `/api/apps/${app.appId}/keys/${created.body.keyId}`,
        );
        assert.equal(revoked.status, 204);
        assert.equal(await getApiKeyBySecret(created.body.key), null);
        const again = await call(
            "DELETE",
            `/api/apps/${app.appId}/keys/${created.body.keyId}`,
        );
        assert.equal(again.status, 404);
        const afterRevoke = await json("GET", `/api/apps/${app.appId}/keys`);
        assert.deepEqual(afterRevoke.body.items, []);
    });

    test("validates the name and expiry", async () => {
        const app = await freshApp("Validation");
        for (const body of [
            {},
            { name: "   " },
            { name: "x".repeat(101) },
            { name: "Key", expiresAt: "not a date" },
            { name: "Key", expiresAt: "2000-01-01T00:00:00Z" },
            { name: "Key", expiresAt: 42 },
        ]) {
            const response = await call("POST", `/api/apps/${app.appId}/keys`, {
                body,
            });
            assert.equal(response.status, 400, JSON.stringify(body));
        }
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
        const created = await json("POST", `/api/apps/${app.appId}/keys`, {
            body: { name: "Expiring", expiresAt },
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.expiresAt, expiresAt);
    });

    test("an app gets at most 10 active keys", async () => {
        const app = await freshApp("Crowded");
        const keyIds: string[] = [];
        for (let index = 0; index < 10; index += 1) {
            const created = await json("POST", `/api/apps/${app.appId}/keys`, {
                body: { name: `Key ${index}` },
            });
            assert.equal(created.status, 201);
            keyIds.push(created.body.keyId);
        }
        const eleventh = await json("POST", `/api/apps/${app.appId}/keys`, {
            body: { name: "Eleventh" },
        });
        assert.equal(eleventh.status, 409);
        assert.equal(eleventh.body.error, "api_key_limit_reached");

        await call("DELETE", `/api/apps/${app.appId}/keys/${keyIds[0]}`);
        const replacement = await call("POST", `/api/apps/${app.appId}/keys`, {
            body: { name: "Replacement" },
        });
        assert.equal(replacement.status, 201);
    });

    test("the configured bootstrap key can't be revoked while it is set", async () => {
        const secret = `ml_live_${"b".repeat(64)}`;
        const [defaultApp] = await listApps(owner.id);
        await syncBootstrapApiKey({
            appId: defaultApp.id,
            keyHash: hashApiKeySecret(secret),
            keyPrefix: secret.slice(0, 12),
            name: "Bootstrap",
        });
        const key = await findApiKeyByHash(hashApiKeySecret(secret));
        const route = `/api/apps/${defaultApp.appId}/keys/${key!.apiKeyId}`;

        const previous = process.env.MEDIALIT_BOOTSTRAP_API_KEY;
        process.env.MEDIALIT_BOOTSTRAP_API_KEY = secret;
        try {
            const listed = await json(
                "GET",
                `/api/apps/${defaultApp.appId}/keys`,
            );
            const managed = listed.body.items.find(
                (item: { keyId: string }) => item.keyId === key!.apiKeyId,
            );
            assert.equal(managed.managedByConfiguration, true);

            const blocked = await json("DELETE", route);
            assert.equal(blocked.status, 409);
            assert.equal(blocked.body.error, "managed_by_configuration");
        } finally {
            if (previous === undefined) {
                delete process.env.MEDIALIT_BOOTSTRAP_API_KEY;
            } else {
                process.env.MEDIALIT_BOOTSTRAP_API_KEY = previous;
            }
        }

        const revoked = await call("DELETE", route);
        assert.equal(revoked.status, 204);
    });
});
