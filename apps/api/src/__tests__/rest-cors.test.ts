import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "../db/client.js";

/*
 * Browsers upload from any site with a signature. API-key endpoints only
 * accept the "Try it" panel at medialit.cloud/docs/api. The cookie-based
 * dashboard API stays same-origin.
 */
let server: Server;
let origin: string;
let client: PGlite;
const docsOrigin = "https://medialit.cloud";

before(async () => {
    const schema = await import("../db/schema/index.js");
    const { setDb } = await import("../db/client.js");
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, {
        migrationsFolder: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../drizzle",
        ),
    });
    setDb(db as unknown as AppDb);

    const { createMedialitAuth } = await import("../auth/better-auth.js");
    const { createApp } = await import("../app.js");
    const { apiReadiness } = await import("../lifecycle.js");

    server = createServer();
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const auth = createMedialitAuth({
        publicApiUrl: origin,
        secret: "cors-test-secret-that-is-at-least-32-chars",
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.close();
});

const customerOrigin = "https://customer.example";

function preflight(pathname: string, headers: string, from = docsOrigin) {
    return fetch(`${origin}${pathname}`, {
        method: "OPTIONS",
        headers: {
            Origin: from,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": headers,
        },
    });
}

const apiKeyEndpoints = [
    "/health",
    "/media/get",
    "/media/get/count",
    "/media/get/abc",
    "/media/seal/abc",
    "/media/signature/create",
    "/settings/media/get",
];

test("the docs can call API-key endpoints from the browser", async () => {
    for (const pathname of apiKeyEndpoints) {
        const response = await preflight(
            pathname,
            "content-type,x-medialit-apikey",
        );
        assert.equal(response.status, 204, pathname);
        assert.equal(
            response.headers.get("access-control-allow-origin"),
            docsOrigin,
            pathname,
        );
        assert.match(
            response.headers.get("access-control-allow-headers") ?? "",
            /x-medialit-apikey/,
            pathname,
        );
    }

    const response = await fetch(`${origin}/media/get/count`, {
        method: "POST",
        headers: { Origin: docsOrigin },
    });
    assert.equal(response.status, 401);
    assert.equal(
        response.headers.get("access-control-allow-origin"),
        docsOrigin,
    );
});

test("other sites can't call API-key endpoints from the browser", async () => {
    for (const pathname of apiKeyEndpoints) {
        const response = await preflight(
            pathname,
            "content-type,x-medialit-apikey",
            customerOrigin,
        );
        const allowed = response.headers.get("access-control-allow-origin");
        assert.ok(
            allowed !== "*" && allowed !== customerOrigin,
            `${pathname} allowed ${allowed}`,
        );
    }
});

test("any site can upload with a signature", async () => {
    for (const pathname of [
        "/media/create",
        "/media/create?group=avatars",
        "/media/create/resumable",
        "/media/create/resumable/abc",
    ]) {
        const response = await preflight(
            pathname,
            "x-medialit-signature,tus-resumable,upload-length",
            customerOrigin,
        );
        assert.equal(response.status, 204, pathname);
        assert.equal(
            response.headers.get("access-control-allow-origin"),
            "*",
            pathname,
        );
    }
});

test("the cookie-based dashboard API stays same-origin", async () => {
    const response = await preflight("/api/apps", "content-type");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
    assert.notEqual(
        response.headers.get("access-control-allow-origin"),
        docsOrigin,
    );
});
