import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { AppDb } from "../../db/client.js";

/*
 * The MCP endpoint end to end: the real app, a real API key, and the
 * official MCP client. Requests are stateless; there are no sessions.
 */
process.env.MEDIALIT_DEPLOYMENT_MODE = "oss";
// The seal-in-progress test seals a private document with no thumbnail, which
// touches no storage once tag lookups are off.
process.env.DISABLE_TAGGING = "true";
// Response URLs are presigned locally; no request reaches this endpoint.
process.env.CLOUD_REGION ??= "us-east-1";
process.env.CLOUD_KEY ??= "test";
process.env.CLOUD_SECRET ??= "test";
process.env.CLOUD_BUCKET_NAME ??= "medialit";
process.env.CLOUD_ENDPOINT ??= "http://127.0.0.1:9";

let server: Server;
let origin: string;
let client: PGlite;
let apiKey: string;
let appPublicId: string;
let userId: string;
let appRowId: string;
let pglite: AppDb;
const clients: Client[] = [];

before(async () => {
    const schema = await import("../../db/schema/index.js");
    const { setDb } = await import("../../db/client.js");
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);
    pglite = db as unknown as AppDb;

    const { createAccount, listApps } = await import("../../db/index.js");
    const { createApiKey } = await import("../../apikey/queries.js");
    const user = await createAccount({ email: "mcp@example.com" });
    const [app] = await listApps(user._id);
    appPublicId = app.appId;
    userId = user._id;
    appRowId = app.id;
    ({ secret: apiKey } = await createApiKey({
        appId: app.id,
        name: "MCP test",
        createdById: user._id,
    }));

    const { createMedialitAuth } = await import("../../auth/better-auth.js");
    const { createApp } = await import("../../app.js");
    const { apiReadiness } = await import("../../lifecycle.js");

    server = createServer();
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const auth = createMedialitAuth({
        publicApiUrl: origin,
        secret: "mcp-route-test-secret-that-is-at-least-32-chars",
        webOrigin: "http://127.0.0.1:3000",
    });
    server.on(
        "request",
        createApp({
            auth,
            webOrigin: "http://127.0.0.1:3000",
            readiness: () =>
                apiReadiness({
                    started: false,
                    shuttingDown: false,
                    pingDatabase: async () => undefined,
                }),
        }),
    );
});

after(async () => {
    await Promise.allSettled(clients.map((mcp) => mcp.close()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.close();
});

async function connect(headers: Record<string, string>) {
    const mcp = new Client(
        { name: "route-test", version: "1.0.0" },
        { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    clients.push(mcp);
    await mcp.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
            requestInit: { headers },
        }),
    );
    return mcp;
}

function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

const listTools = (headers: Record<string, string>) =>
    post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, headers);

test("an API key sent as x-medialit-apikey lists and calls tools", async () => {
    const mcp = await connect({ "x-medialit-apikey": apiKey });

    const { tools } = await mcp.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
        "create_upload_signature",
        "create_webhook",
        "delete_media",
        "delete_webhook",
        "get_media",
        "get_media_count",
        "get_media_settings",
        "get_total_storage",
        "list_media",
        "list_webhooks",
        "seal_media",
        "test_webhook",
        "update_media_settings",
        "update_webhook",
        "upload_media",
        "whoami",
    ]);
    const deleteMedia = tools.find((tool) => tool.name === "delete_media")!;
    assert.equal(deleteMedia.annotations?.destructiveHint, true);
    assert.ok(deleteMedia.inputSchema.properties?.confirm);

    const whoami = await mcp.callTool({ name: "whoami", arguments: {} });
    assert.equal(whoami.isError, undefined);
    const { maxStorage, ...identity } = whoami.structuredContent as any;
    assert.deepEqual(identity, {
        auth: "apikey",
        email: "mcp@example.com",
        app: { id: appPublicId, name: "My Store", default: true },
        files: 0,
        storage: 0,
    });
    assert.ok(Number.isSafeInteger(maxStorage) && maxStorage > 0);
    assert.doesNotMatch(JSON.stringify(whoami), new RegExp(apiKey));
});

test("a destructive tool needs confirm: true", async () => {
    const mcp = await connect({ "x-medialit-apikey": apiKey });
    const refused = await mcp.callTool({
        name: "delete_media",
        arguments: { mediaId: "missing" },
    });
    assert.equal(refused.isError, true);
    assert.deepEqual(refused.structuredContent, {
        code: "forbidden",
        message: "The requested action is not permitted.",
        details: { confirmation: "required" },
    });

    const missing = await mcp.callTool({
        name: "get_media",
        arguments: { mediaId: "missing" },
    });
    assert.equal(missing.isError, true);
    assert.equal((missing.structuredContent as any).code, "not_found");
});

test("2025-era clients initialize without a session", async () => {
    const response = await post(
        {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2025-11-25",
                capabilities: {},
                clientInfo: { name: "legacy", version: "1.0.0" },
            },
        },
        { "x-medialit-apikey": apiKey },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("mcp-session-id"), null);
    const body = await response.json();
    assert.equal(body.result.serverInfo.name, "MediaLit");

    const tools = await listTools({
        "x-medialit-apikey": apiKey,
        "mcp-protocol-version": "2025-11-25",
    });
    assert.equal(tools.status, 200);
    assert.equal((await tools.json()).result.tools.length, 11);
});

test("a request without credentials gets the OAuth challenge", async () => {
    const response = await listTools({});
    assert.equal(response.status, 401);
    assert.equal(
        response.headers.get("www-authenticate"),
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    );
    assert.equal((await response.json()).code, "unauthenticated");

    const invalid = await listTools({ authorization: "Bearer not-a-token" });
    assert.equal(invalid.status, 401);
    assert.deepEqual((await invalid.json()).details, {
        reason: "invalid_token",
    });

    const wrongKey = await listTools({ "x-medialit-apikey": "ml_live_nope" });
    assert.equal(wrongKey.status, 401);
});

test("two credentials at once are ambiguous", async () => {
    const pairs: Record<string, string>[] = [
        { "x-medialit-apikey": apiKey, "x-api-key": apiKey },
        { "x-medialit-apikey": apiKey, authorization: "Bearer token" },
    ];
    for (const headers of pairs) {
        const response = await listTools(headers);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, "credential_ambiguous");
    }
});

test("CORS preflight allows MediaLit's key header; GET, non-JSON and bad JSON are refused", async () => {
    const preflight = await fetch(`${origin}/mcp`, {
        method: "OPTIONS",
        headers: { origin: "https://client.example" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
        preflight.headers.get("access-control-allow-origin"),
        "https://client.example",
    );
    assert.match(
        preflight.headers.get("access-control-allow-headers") ?? "",
        /x-medialit-apikey/,
    );

    const get = await fetch(`${origin}/mcp`, {
        headers: { "x-medialit-apikey": apiKey },
    });
    assert.equal(get.status, 405);

    const text = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
    });
    assert.equal(text.status, 415);

    const malformed = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, -32700);
});

test("seal_media and POST /media/seal report a seal in progress, and a retry seals", async () => {
    // A live API can't hold a seal open on demand, so this holds the claim
    // in the database, as a slow seal in another request would.
    const { sql } = await import("drizzle-orm");
    const { createMediaRecord } = await import("../../db/index.js");
    const { SEAL_IN_PROGRESS } = await import("../../media/seal.js");
    const mediaId = "seal-in-progress";
    await createMediaRecord({
        fileName: "main.txt",
        mediaId,
        userId,
        appId: appRowId,
        originalFileName: "notes.txt",
        mimeType: "text/plain",
        size: 5,
        thumbnailGenerated: false,
        accessControl: "private",
        temp: true,
    });
    const holdClaim = (until: string) =>
        pglite.execute(
            sql`update media set seal_claim = 'other-request', sealing_until = now() + ${until}::interval where media_id = ${mediaId}`,
        );
    await holdClaim("1 minute");
    process.env.SEAL_WAIT_MS = "300";
    try {
        const mcp = await connect({ "x-medialit-apikey": apiKey });
        const conflict = await mcp.callTool({
            name: "seal_media",
            arguments: { mediaId, confirm: true },
        });
        assert.equal(conflict.isError, true);
        assert.deepEqual(conflict.structuredContent, {
            code: "conflict",
            message: (conflict.structuredContent as any).message,
            details: { reason: "seal_in_progress", message: SEAL_IN_PROGRESS },
        });

        const rest = await fetch(`${origin}/media/seal/${mediaId}`, {
            method: "POST",
            headers: { "x-medialit-apikey": apiKey },
        });
        assert.equal(rest.status, 503);
        assert.equal(rest.headers.get("retry-after"), "1");
        assert.deepEqual(await rest.json(), { error: SEAL_IN_PROGRESS });

        // The other request died: its claim expires, and the retry seals.
        await holdClaim("-1 second");
        const sealed = await mcp.callTool({
            name: "seal_media",
            arguments: { mediaId, confirm: true },
        });
        assert.equal(sealed.isError, undefined);
        assert.equal((sealed.structuredContent as any).mediaId, mediaId);
        assert.equal(
            (sealed.structuredContent as any).processing.status,
            "ready",
        );
        const again = await fetch(`${origin}/media/seal/${mediaId}`, {
            method: "POST",
            headers: { "x-medialit-apikey": apiKey },
        });
        assert.equal(again.status, 200);
    } finally {
        delete process.env.SEAL_WAIT_MS;
    }
});
