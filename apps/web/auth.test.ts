import assert from "node:assert/strict";
import test from "node:test";
import { getSessionFromCookieHeader } from "./auth";

test("forwards the Better Auth cookie to the API session endpoint", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const session = await getSessionFromCookieHeader(
        "better-auth.session_token=signed-session",
        async (url, init) => {
            requestedUrl = String(url);
            requestedInit = init;
            return new Response(
                JSON.stringify({
                    user: { id: "user-1", email: "user@example.com" },
                }),
                {
                    status: 200,
                    headers: { "content-type": "application/json" },
                },
            );
        },
    );

    assert.equal(requestedUrl, "http://localhost:8000/api/auth/get-session");
    assert.equal(
        new Headers(requestedInit?.headers).get("cookie"),
        "better-auth.session_token=signed-session",
    );
    assert.equal(requestedInit?.cache, "no-store");
    assert.deepEqual(session, {
        user: { id: "user-1", email: "user@example.com" },
    });
});

test("fails closed for an invalid or unavailable API session", async () => {
    await assert.doesNotReject(async () => {
        const invalid = await getSessionFromCookieHeader(
            "better-auth.session_token=bad",
            async () => new Response("null", { status: 200 }),
        );
        assert.equal(invalid, null);

        const unavailable = await getSessionFromCookieHeader(
            "better-auth.session_token=bad",
            async () => {
                throw new TypeError("connection refused");
            },
        );
        assert.equal(unavailable, null);
    });
});

test("does not make a session request without a cookie", async () => {
    let called = false;
    const session = await getSessionFromCookieHeader("", async () => {
        called = true;
        return new Response();
    });

    assert.equal(session, null);
    assert.equal(called, false);
});
