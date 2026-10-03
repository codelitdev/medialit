import { test } from "node:test";
import assert from "node:assert/strict";
import {
    resolveAuth,
    selectEffectiveApiKey,
    sendAuthError,
} from "../resolve-auth.js";
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

function noFallback() {
    return dependencies({
        validateBearerToken: async () => {
            throw new Error("token validation must not run");
        },
        getApiKeyUsingKeyId: async () => {
            throw new Error("API key fallback must not run");
        },
    });
}

test("Bearer token plus API key is ambiguous and validates neither", async () => {
    const auth = await resolveAuth(
        {
            authorization: "Bearer invalid-token",
            apiKeyHeader: "submitted-key",
        },
        noFallback(),
    );

    assert.deepEqual(auth, { status: "ambiguous" });
});

test("Bearer token plus a body API key is ambiguous", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token", bodyApiKey: "submitted-key" },
        noFallback(),
    );

    assert.deepEqual(auth, { status: "ambiguous" });
});

test("invalid Bearer token is rejected", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer invalid-token" },
        dependencies({ validateBearerToken: async () => null }),
    );

    assert.deepEqual(auth, { status: "invalid_token" });
});

test("malformed Authorization never falls back to the API key", async () => {
    for (const authorization of [
        "Basic dXNlcjpwYXNz",
        "Bearer",
        "Bearer a b",
    ]) {
        const auth = await resolveAuth(
            { authorization, apiKeyHeader: "submitted-key" },
            noFallback(),
        );

        assert.deepEqual(auth, { status: "invalid_token" }, authorization);
    }
});

test("different header and body API keys are ambiguous", async () => {
    const auth = await resolveAuth(
        { apiKeyHeader: "header-key", bodyApiKey: "body-key" },
        noFallback(),
    );

    assert.deepEqual(auth, { status: "ambiguous" });
});

test("the same API key in header and body is one credential", async () => {
    const auth = await resolveAuth(
        { apiKeyHeader: "submitted-key", bodyApiKey: "submitted-key" },
        dependencies({}),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "apikey");
    assert.equal(auth.apiKey, "submitted-key");
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

test("ambiguous credentials return the Platform 400 error", () => {
    let status = 0;
    let body: unknown;
    const response = {
        setHeader() {},
        status(code: number) {
            status = code;
            return this;
        },
        json(value: unknown) {
            body = value;
            return this;
        },
    };

    assert.equal(sendAuthError(response, { status: "ambiguous" }), true);
    assert.equal(status, 400);
    assert.deepEqual(body, {
        error: "credential_ambiguous",
        error_description: "Exactly one credential mechanism is allowed.",
    });
});

test("MCP auth errors advertise protected-resource metadata", () => {
    const headers = new Map<string, string>();
    const response = {
        statusCode: 200,
        setHeader(name: string, value: string) {
            headers.set(name, value);
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(_body: unknown) {
            return this;
        },
    };
    const metadataUrl =
        "http://localhost:8000/.well-known/oauth-protected-resource/mcp";

    assert.equal(
        sendAuthError(response, { status: "missing" }, metadataUrl),
        true,
    );
    assert.equal(response.statusCode, 401);
    assert.equal(
        headers.get("WWW-Authenticate"),
        `Bearer resource_metadata="${metadataUrl}"`,
    );
});
