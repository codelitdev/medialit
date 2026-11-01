import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthMiddleware } from "../middleware.js";
import { AuthResult } from "../resolve-auth.js";

function response() {
    return {
        statusCode: 200,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
    };
}

test("REST middleware maps successful OAuth auth to req.user and req.appId", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, body: {} };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware(async () => ({
        status: "authenticated",
        kind: "oauth",
        user: { id: "user-1" },
        userId: "user-1",
        clientId: "client-1",
        scopes: ["read"],
        appId: "internal-default",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.appId, "internal-default");
    assert.equal(req.apiKeyId, undefined);
});

test("REST middleware maps API-key auth to internal IDs, never the secret", async () => {
    const req: any = {
        headers: { "x-medialit-apikey": "submitted-key" },
        body: {},
    };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware(async () => ({
        status: "authenticated",
        kind: "apikey",
        user: { id: "user-1" },
        userId: "user-1",
        appId: "internal-app",
        apiKeyId: "internal-key",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.appId, "internal-app");
    assert.equal(req.apiKeyId, "internal-key");
    assert.equal(req.apikey, undefined);
});

test("REST middleware uses shared invalid Bearer 401 behavior", async () => {
    const req: any = { headers: { authorization: "Bearer bad" }, body: {} };
    const res = response();
    const middleware = createAuthMiddleware(async () => ({
        status: "invalid_token",
    }));

    await middleware(req, res as any, () => {
        throw new Error("next should not be called");
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
        error: "invalid_token",
        error_description: "Access token is invalid or expired",
    });
});
