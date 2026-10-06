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
import {
    type McpDiscoveryAdapter,
    runMcpDiscoveryConformance,
} from "@codelitdev/platform-conformance";

/*
 * MediaLit declares the auth and MCP capabilities. Its domain is media, not
 * the reference product's notes, so `runPlatformConformance` does not apply.
 * Billing, observability, and lifecycle stay covered by their own tests.
 */
let server: Server;
let origin: string;
let adapter: McpDiscoveryAdapter;
let client: PGlite;

before(async () => {
    // Better Auth's OAuth provider seeds its resources on first use, so the
    // real app needs a migrated database even for anonymous discovery.
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
        secret: "conformance-secret-that-is-at-least-32-chars",
        webOrigin: "http://127.0.0.1:3000",
    });
    const app = createApp({
        auth,
        webOrigin: "http://127.0.0.1:3000",
        readiness: () =>
            apiReadiness({
                started: false,
                shuttingDown: false,
                pingDatabase: async () => undefined,
            }),
    });
    server.on("request", app);

    adapter = {
        async request(input) {
            const response = await fetch(`${origin}${input.path}`, {
                method: input.method,
                headers: input.headers,
                ...(input.body === undefined
                    ? {}
                    : { body: JSON.stringify(input.body) }),
            });
            const text = await response.text();
            return {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                body: text ? JSON.parse(text) : null,
            };
        },
    };
});

after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { closeDb } = await import("../db/client.js");
    await closeDb();
    await client.close();
});

test("platform conformance: MCP OAuth discovery", async () => {
    const result = await runMcpDiscoveryConformance(adapter, {
        resourceUrl: `${origin}/mcp`,
    });
    assert.deepEqual(result.failures, []);
});
