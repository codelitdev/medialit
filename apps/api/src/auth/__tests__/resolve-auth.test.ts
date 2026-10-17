import { test } from "node:test";
import assert from "node:assert/strict";
import {
    resolveAuth,
    selectEffectiveApp,
    sendAuthError,
} from "../resolve-auth.js";
import type { ApiKeyAuthRecord, AppRecord } from "@/db";

const user = { _id: "user-1", id: "user-1", active: true };

function app(appId: string, overrides: Partial<AppRecord> = {}): AppRecord {
    return {
        id: `internal-${appId}`,
        appId,
        name: appId,
        userId: "user-1",
        default: false,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function keyFor(
    appId: string,
    overrides: Partial<ApiKeyAuthRecord> = {},
): ApiKeyAuthRecord {
    return {
        key: {
            id: `key-of-${appId}`,
            apiKeyId: `ak_${appId}`,
            appId: `internal-${appId}`,
            name: "Key",
            keyHash: "hash",
            keyPrefix: "ml_live_abcd",
            createdByType: "user",
            createdAt: new Date(),
        },
        app: app(appId),
        ownerActive: true,
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
        listApps: async () => [app("first")],
        getApiKeyBySecret: async () => keyFor("keyed"),
        ...overrides,
    } as NonNullable<Parameters<typeof resolveAuth>[1]>;
}

test("selectEffectiveApp prefers the default app", () => {
    const selected = selectEffectiveApp([
        app("first"),
        app("default", { default: true }),
    ]);

    assert.equal(selected?.appId, "default");
});

test("selectEffectiveApp falls back to the first app", () => {
    const selected = selectEffectiveApp([app("first"), app("second")]);

    assert.equal(selected?.appId, "first");
});

test("OAuth auth resolves the user's default app", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            listApps: async () => [
                app("first"),
                app("default", { default: true }),
            ],
        }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.appId, "internal-default");
});

test("OAuth auth falls back to the first app when no default exists", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            listApps: async () => [app("first"), app("second")],
        }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.appId, "internal-first");
});

test("OAuth auth maps the picked app's public ID to its internal ID", async () => {
    const lookups: unknown[] = [];
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            validateBearerToken: async () => ({
                userId: "user-1",
                clientId: "client-1",
                scopes: ["read"],
                appId: "picked",
            }),
            listApps: async (userId: string, appId?: string) => {
                lookups.push([userId, appId]);
                return appId === "picked"
                    ? [app("picked")]
                    : [app("default", { default: true })];
            },
        }),
    );

    assert.deepEqual(lookups, [["user-1", "picked"]]);
    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.appId, "internal-picked");
});

test("OAuth auth rejects a token whose picked app was deleted", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({
            validateBearerToken: async () => ({
                userId: "user-1",
                clientId: "client-1",
                scopes: ["read"],
                appId: "deleted",
            }),
            listApps: async (_userId: string, appId?: string) =>
                appId ? [] : [app("default", { default: true })],
        }),
    );

    assert.equal(auth.status, "invalid_token");
});

test("OAuth auth succeeds without an app when the user has none", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({ listApps: async () => [] }),
    );

    assert.equal(auth.status, "authenticated");
    assert.equal(auth.kind, "oauth");
    assert.equal(auth.appId, undefined);
});

test("OAuth auth rejects a deactivated account", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({ getUser: async () => ({ ...user, active: false }) }),
    );

    assert.deepEqual(auth, {
        status: "forbidden",
        error: "account_inactive",
    });
});

function noFallback() {
    return dependencies({
        validateBearerToken: async () => {
            throw new Error("token validation must not run");
        },
        getApiKeyBySecret: async () => {
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

test("a key in the request body is not a credential", async () => {
    const auth = await resolveAuth(
        { bodyApiKey: "submitted-key" } as any,
        noFallback(),
    );

    assert.deepEqual(auth, { status: "missing" });
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

test("OAuth auth rejects a token for a missing user", async () => {
    const auth = await resolveAuth(
        { authorization: "Bearer valid-token" },
        dependencies({ getUser: async () => null }),
    );

    assert.deepEqual(auth, { status: "unauthorized" });
});

test("API-key auth resolves internal app and key IDs, never the secret", async () => {
    const submitted: string[] = [];
    const auth = await resolveAuth(
        { apiKeyHeader: "ml_live_submitted" },
        dependencies({
            getApiKeyBySecret: async (secret: string) => {
                submitted.push(secret);
                return keyFor("keyed");
            },
        }),
    );

    assert.deepEqual(submitted, ["ml_live_submitted"]);
    assert.deepEqual(auth, {
        status: "authenticated",
        kind: "apikey",
        user,
        userId: "user-1",
        appId: "internal-keyed",
        apiKeyId: "key-of-keyed",
    });
    assert.equal(JSON.stringify(auth).includes("ml_live_submitted"), false);
});

test("an unknown, revoked or deleted-app key is unauthorized", async () => {
    const auth = await resolveAuth(
        { apiKeyHeader: "ml_live_unknown" },
        dependencies({ getApiKeyBySecret: async () => null }),
    );

    assert.deepEqual(auth, { status: "unauthorized" });
});

test("API-key auth rejects a deactivated account", async () => {
    for (const deps of [
        {
            getApiKeyBySecret: async () =>
                keyFor("keyed", { ownerActive: false }),
        },
        { getUser: async () => ({ ...user, active: false }) },
    ]) {
        const auth = await resolveAuth(
            { apiKeyHeader: "ml_live_submitted" },
            dependencies(deps),
        );

        assert.deepEqual(auth, {
            status: "forbidden",
            error: "account_inactive",
        });
    }
});

test("missing auth returns missing", async () => {
    const auth = await resolveAuth({}, dependencies({}));

    assert.deepEqual(auth, { status: "missing" });
});

test("a deactivated account gets 403 account_inactive", () => {
    let status = 0;
    let body: any;
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

    assert.equal(
        sendAuthError(response, {
            status: "forbidden",
            error: "account_inactive",
        }),
        true,
    );
    assert.equal(status, 403);
    assert.equal(body.error, "account_inactive");
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
