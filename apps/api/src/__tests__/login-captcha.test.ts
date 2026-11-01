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
import { loginCaptchaConfig } from "../auth/options.js";

/*
 * With Turnstile keys set, the hosted login page renders the widget and the
 * API refuses to email a sign-in code without a Turnstile token.
 */
let server: Server;
let origin: string;
let client: PGlite;
const siteKey = "1x00000000000000000000AA";

before(async () => {
    process.env.TURNSTILE_SITE_KEY = siteKey;
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

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
        secret: "captcha-test-secret-that-is-at-least-32-chars",
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
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await client.close();
});

test("the login page renders the Turnstile widget", async () => {
    const response = await fetch(`${origin}/login`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`data-sitekey="${siteKey}"`));
    assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
});

test("sending a sign-in code needs a Turnstile token", async () => {
    const response = await fetch(
        `${origin}/api/auth/email-otp/send-verification-otp`,
        {
            method: "POST",
            headers: { "content-type": "application/json", origin },
            body: JSON.stringify({
                email: "someone@example.com",
                type: "sign-in",
            }),
        },
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "MISSING_RESPONSE");
});

test("Turnstile is off without keys and refuses half a configuration", () => {
    assert.equal(loginCaptchaConfig({}), undefined);
    assert.deepEqual(
        loginCaptchaConfig({
            TURNSTILE_SITE_KEY: " site ",
            TURNSTILE_SECRET_KEY: "secret",
        }),
        { siteKey: "site", secretKey: "secret" },
    );
    assert.throws(
        () => loginCaptchaConfig({ TURNSTILE_SITE_KEY: "site" }),
        /must be set together/,
    );
    assert.throws(
        () => loginCaptchaConfig({ TURNSTILE_SECRET_KEY: "secret" }),
        /must be set together/,
    );
});
