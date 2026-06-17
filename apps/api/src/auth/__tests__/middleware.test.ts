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

test("REST middleware maps successful OAuth auth to req.user and req.apikey", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, body: {} };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware("rest", async () => ({
        status: "authenticated",
        kind: "oauth",
        user: { id: "user-1" },
        userId: "user-1",
        clientId: "client-1",
        scopes: ["read"],
        apiKey: "default-key",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.apikey, "default-key");
});

test("REST middleware maps API-key auth to the submitted API key", async () => {
    const req: any = {
        headers: { "x-medialit-apikey": "submitted-key" },
        body: {},
    };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware("rest", async () => ({
        status: "authenticated",
        kind: "apikey",
        user: { id: "user-1" },
        userId: "user-1",
        apiKey: "submitted-key",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.apikey, "submitted-key");
});

test("REST middleware uses shared invalid Bearer 401 behavior", async () => {
    const req: any = { headers: { authorization: "Bearer bad" }, body: {} };
    const res = response();
    const middleware = createAuthMiddleware("rest", async () => ({
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

test("MCP middleware maps OAuth auth fields", async () => {
    const req: any = { headers: { authorization: "Bearer token" }, body: {} };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware("mcp", async () => ({
        status: "authenticated",
        kind: "oauth",
        user: { id: "user-1" },
        userId: "user-1",
        clientId: "client-1",
        scopes: ["read"],
        apiKey: "default-key",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.userId, "user-1");
    assert.equal(req.clientId, "client-1");
    assert.deepEqual(req.scopes, ["read"]);
    assert.equal(req.apikey, "default-key");
});

test("MCP middleware maps API-key auth fields without OAuth fields", async () => {
    const req: any = {
        headers: { "x-medialit-apikey": "submitted-key" },
        body: {},
    };
    const res = response();
    let nextCalled = false;
    const middleware = createAuthMiddleware("mcp", async () => ({
        status: "authenticated",
        kind: "apikey",
        user: { id: "user-1" },
        userId: "user-1",
        apiKey: "submitted-key",
    }));

    await middleware(req, res as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: "user-1" });
    assert.equal(req.userId, "user-1");
    assert.equal(req.apikey, "submitted-key");
    assert.equal(req.clientId, undefined);
    assert.equal(req.scopes, undefined);
});

test("MCP middleware preserves missing-auth 401 behavior", async () => {
    const req: any = { headers: {}, body: {} };
    const res = response();
    const middleware = createAuthMiddleware(
        "mcp",
        async (): Promise<AuthResult> => ({
            status: "missing",
        }),
    );

    await middleware(req, res as any, () => {
        throw new Error("next should not be called");
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
        error: "unauthorized",
        error_description:
            "Missing authentication: provide Authorization: Bearer <token> or x-medialit-apikey header",
    });
});
