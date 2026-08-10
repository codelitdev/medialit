import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import type { Repositories } from "@medialit/db";

process.env["OAUTH_SIGNING_KEY"] = crypto.randomBytes(32).toString("hex");
process.env["DB_CONNECTION_STRING"] ||=
    "postgres://postgres:postgres@localhost:5432/medialit_test";

let dbAvailable = false;

// Loaded dynamically (rather than via a static import) so these modules -
// and the DB_CONNECTION_STRING they read at import time - are only
// evaluated after the env vars above have been set.
async function loadConnectToDatabase(): Promise<() => Promise<void>> {
    const mod: unknown = await import("../../config/db.js");
    return (mod as { default: () => Promise<void> }).default;
}

async function loadGetRepositories(): Promise<() => Repositories> {
    const mod: unknown = await import("../../config/repositories.js");
    return (mod as { default: () => Repositories }).default;
}

before(async () => {
    const connectToDatabase = await loadConnectToDatabase();
    const originalExit = process.exit;
    try {
        // connectToDatabase() calls process.exit(1) on failure; intercept
        // so an unreachable local Postgres just skips the DB-backed tests
        // instead of killing the test runner.
        process.exit = ((code?: number) => {
            throw new Error(`process.exit(${code})`);
        }) as typeof process.exit;
        await connectToDatabase();
        dbAvailable = true;
    } catch {
        dbAvailable = false;
    } finally {
        process.exit = originalExit;
    }
});

after(async () => {
    if (!dbAvailable) return;
    const { closeDatabase } = await import("@medialit/db");
    await closeDatabase();
});

function randomClientMeta(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        redirect_uris: [`http://127.0.0.1:33418/${crypto.randomUUID()}`],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        client_name: "VS Code",
        scope: "read write",
        ...overrides,
    };
}

test("registerClient persists DCR clients via the oauth client repository", async (t) => {
    if (!dbAvailable) return t.skip("no Postgres reachable for DB-backed test");

    const { registerClient } = await import("../model.js");
    const getRepositories = await loadGetRepositories();

    const meta = randomClientMeta();
    const response = await registerClient(meta);

    const saved = await getRepositories().oauthClients.findByClientId(
        response.client_id,
    );

    assert.ok(saved);
    assert.equal(saved?.clientId, response.client_id);
    assert.deepEqual(saved?.redirectUris, response.redirect_uris);
    assert.deepEqual(saved?.grantTypes, [
        "authorization_code",
        "refresh_token",
    ]);
    assert.equal(saved?.tokenEndpointAuthMethod, "none");
    assert.equal(saved?.clientName, "VS Code");
    assert.equal(saved?.scope, "read write");
    assert.equal(response.client_secret_expires_at, 0);
});

test("registerClient rejects non-loopback http redirect URIs", async () => {
    const { DcrValidationError, registerClient } = await import("../model.js");

    await assert.rejects(
        registerClient({
            redirect_uris: ["http://example.com/callback"],
        }),
        DcrValidationError,
    );
});

test("registerClient rejects redirect URIs with fragments or credentials", async () => {
    const { DcrValidationError, registerClient } = await import("../model.js");

    await assert.rejects(
        registerClient({
            redirect_uris: ["https://example.com/callback#fragment"],
        }),
        DcrValidationError,
    );

    await assert.rejects(
        registerClient({
            redirect_uris: ["https://user@example.com/callback"],
        }),
        DcrValidationError,
    );
});

test("registerClient rejects unsupported DCR grants", async () => {
    const { DcrValidationError, registerClient } = await import("../model.js");

    await assert.rejects(
        registerClient({
            redirect_uris: ["http://127.0.0.1:33418/"],
            grant_types: ["client_credentials"],
        }),
        DcrValidationError,
    );
});

test("redirectUriMatchesRegistered requires exact redirect URI match", async () => {
    const { redirectUriMatchesRegistered } = await import("../helpers.js");
    const registered = ["https://example.com/callback"];

    assert.equal(
        redirectUriMatchesRegistered(
            "https://example.com/callback",
            registered,
        ),
        true,
    );
    assert.equal(
        redirectUriMatchesRegistered(
            "https://example.com/callback?next=/evil",
            registered,
        ),
        false,
    );
});

test("hashOtp binds OTP hashes to the pending session", async () => {
    const { hashOtp } = await import("../helpers.js");

    assert.equal(
        hashOtp("pending-1", "123456"),
        hashOtp("pending-1", "123456"),
    );
    assert.notEqual(
        hashOtp("pending-1", "123456"),
        hashOtp("pending-2", "123456"),
    );
});

test("oauthModel.getClient resolves DCR clients from the oauth client repository", async (t) => {
    if (!dbAvailable) return t.skip("no Postgres reachable for DB-backed test");

    const { registerClient, oauthModel } = await import("../model.js");

    const meta = randomClientMeta();
    const registered = await registerClient(meta);
    const client = await oauthModel.getClient(registered.client_id, "");

    assert.ok(client);
    assert.equal(client.id, registered.client_id);
    assert.deepEqual(client.redirectUris, registered.redirect_uris);
    assert.deepEqual(client.grants, ["authorization_code", "refresh_token"]);
});

test("oauthModel.saveToken uses expiry dates supplied by oauth2-server", async () => {
    const { oauthModel } = await import("../model.js");
    const accessTokenExpiresAt = new Date("2030-01-01T00:00:00.000Z");
    const refreshTokenExpiresAt = new Date("2030-02-01T00:00:00.000Z");

    const savedToken = (await oauthModel.saveToken(
        {
            accessTokenExpiresAt,
            refreshTokenExpiresAt,
            scope: ["read"],
        } as any,
        { id: "client-1" } as any,
        { id: "user-1" } as any,
    )) as any;

    assert.equal(savedToken.accessTokenExpiresAt, accessTokenExpiresAt);
    assert.equal(savedToken.refreshTokenExpiresAt, refreshTokenExpiresAt);
});

test("oauthModel.getRefreshToken rejects revoked refresh tokens", async (t) => {
    if (!dbAvailable) return t.skip("no Postgres reachable for DB-backed test");

    const { oauthModel } = await import("../model.js");

    const savedToken = (await oauthModel.saveToken(
        { scope: ["read"] } as any,
        { id: "client-1" } as any,
        { id: "user-1" } as any,
    )) as any;

    const beforeRevoke = await oauthModel.getRefreshToken(
        savedToken.refreshToken,
    );
    assert.ok(beforeRevoke);

    await oauthModel.revokeToken(beforeRevoke);

    const afterRevoke = await oauthModel.getRefreshToken(
        savedToken.refreshToken,
    );
    assert.equal(afterRevoke, null);
});

test("oauthModel.revokeToken persists refresh token jti with expiry", async (t) => {
    if (!dbAvailable) return t.skip("no Postgres reachable for DB-backed test");

    const { oauthModel } = await import("../model.js");
    const getRepositories = await loadGetRepositories();

    const savedToken = (await oauthModel.saveToken(
        { scope: ["read"] } as any,
        { id: "client-1" } as any,
        { id: "user-1" } as any,
    )) as any;
    const refreshToken = await oauthModel.getRefreshToken(
        savedToken.refreshToken,
    );
    assert.ok(refreshToken);

    await oauthModel.revokeToken(refreshToken);

    const { verifyRefreshToken } = await import("../jwt.js");
    const payload = verifyRefreshToken(savedToken.refreshToken);
    assert.ok(payload?.jti);

    const revoked = await getRepositories().oauthRevokedTokens.findByJti(
        payload!.jti!,
    );

    assert.ok(revoked);
    assert.equal(revoked?.tokenType, "refresh_token");
    assert.equal(revoked?.userId, "user-1");
    assert.equal(revoked?.clientId, "client-1");
    assert.ok(revoked?.expiresAt instanceof Date);
});
