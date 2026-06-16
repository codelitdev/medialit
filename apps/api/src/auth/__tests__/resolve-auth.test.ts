import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuth, selectEffectiveApiKey } from "../resolve-auth.js";
import { Apikey } from "@medialit/models";

const user = { _id: "user-1", id: "user-1" };

function apiKey(key: string, overrides: Partial<Apikey> = {}): Apikey {
    return {
        key,
        keyId: key,
        name: key,
        userId: { toString: () => "user-1" } as any,
        default: false,
        deleted: false,
        ...overrides,
    };
}

function dependencies(overrides: Partial<Parameters<typeof resolveAuth>[1]>) {
    return {
        validateBearerToken: async () => ({
            userId: "user-1",
            clientId: "client-1",
            scopes: ["read"],
        }),
        getUser: async () => user,
        getApiKeyByUserId: async () => [apiKey("first")],
        getApiKeyUsingKeyId: async (key: string) => apiKey(key),
        ...overrides,
    } as NonNullable<Parameters<typeof resolveAuth>[1]>;
}

test("selectEffectiveApiKey prefers the default key", () => {
    const selected = selectEffectiveApiKey([
        apiKey("first"),
        apiKey("default", { default: true }),
    ]);

    assert.equal(selected?.key, "default");
});

test("selectEffectiveApiKey falls back to the first key", () => {
    const selected = selectEffectiveApiKey([apiKey("first"), apiKey("second")]);

    assert.equal(selected?.key, "first");
});

test("OAuth auth resolves the user's default API key", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            getApiKeyByUserId: async () => [
                apiKey("first"),
                apiKey("default", { default: true }),
            ],
        }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.apiKey, "default");
});

test("OAuth auth falls back to the first API key when no default exists", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            getApiKeyByUserId: async () => [apiKey("first"), apiKey("second")],
        }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.apiKey, "first");
});

test("OAuth auth succeeds without an API key when the user has none", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({ getApiKeyByUserId: async () => [] }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.apiKey, undefined);
});

test("invalid Bearer token is rejected before API-key fallback", async () => {
    const auth = await resolveAuth(
        {
            authorization: "Bearer invalid-token",
            apiKeyHeader: "submitted-key",
        },
        dependencies({
            validateBearerToken: async () => null,
            getApiKeyUsingKeyId: async () => {
                throw new Error("API key fallback must not run");
            },
        }),
    );

    assert.deepEqual(auth, { status: "invalid_token" });
});

test("OAuth auth rejects a token for a missing user", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({ getUser: async () => null }),
    );

    assert.deepEqual(auth, { status: "unauthorized" });
});

test("API-key auth preserves the submitted key", async () => {
    const auth = await resolveAuth(
        { apiKeyHeader: "submitted-key" },
        dependencies({
            getApiKeyUsingKeyId: async () =>
                apiKey("stored-key", { default: true }),
        }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "apikey");
    assert.equal(auth.apiKey, "submitted-key");
});

test("missing auth returns missing", async () => {
    const auth = await resolveAuth({}, dependencies({}));

    assert.deepEqual(auth, { status: "missing" });
});
