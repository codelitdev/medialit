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
 * The REST API authenticates by header, so browsers on any origin may call
 * it, e.g. the "Try it" panel at medialit.cloud/docs/api. The dashboard API
 * uses session cookies and must stay same-origin.
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

function preflight(pathname: string, headers: string) {
    return fetch(`${origin}${pathname}`, {
        method: "OPTIONS",
        headers: {
            Origin: docsOrigin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": headers,
        },
    });
}

test("documented endpoints accept cross-origin calls with an API key", async () => {
    for (const pathname of [
        "/media/get/count",
        "/media/get/abc",
        "/media/signature/create",
        "/media/create",
        "/settings/media/get",
    ]) {
        const response = await preflight(
            pathname,
            "content-type,x-medialit-apikey",
        );
        assert.equal(response.status, 204, pathname);
        assert.equal(
            response.headers.get("access-control-allow-origin"),
            "*",
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
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("the cookie-based dashboard API stays same-origin", async () => {
    const response = await preflight("/api/apps", "content-type");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
    assert.notEqual(
        response.headers.get("access-control-allow-origin"),
        docsOrigin,
    );
});
