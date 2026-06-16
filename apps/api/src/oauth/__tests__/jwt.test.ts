import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env["OAUTH_SIGNING_KEY"] = TEST_KEY;

let signAccessToken: any,
    signRefreshToken: any,
    verifyAccessToken: any,
    verifyRefreshToken: any;
(async () => {
    const mod = await import("../jwt.js");
    signAccessToken = mod.signAccessToken;
    signRefreshToken = mod.signRefreshToken;
    verifyAccessToken = mod.verifyAccessToken;
    verifyRefreshToken = mod.verifyRefreshToken;
})();

async function waitForImport() {
    while (!signAccessToken) await new Promise((r) => setTimeout(r, 10));
}

test("signAccessToken -> verifyAccessToken round trip", async () => {
    await waitForImport();
    const token = signAccessToken("user-1", "client-1", ["read", "write"]);
    const payload = verifyAccessToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.deepEqual(payload?.scope, ["read", "write"]);
    assert.equal(typeof payload?.exp, "number");
});

test("access token stores scope as an OAuth space-delimited string", async () => {
    await waitForImport();
    const token = signAccessToken("user-1", "client-1", ["read", "write"]);
    const decoded = jwt.decode(token) as any;

    assert.equal(decoded.scope, "read write");
});

test("verifyAccessToken accepts legacy array scope tokens", async () => {
    await waitForImport();
    const token = jwt.sign(
        {
            sub: "user-1",
            cid: "client-1",
            typ: "access",
            scope: ["read", "write"],
        },
        TEST_KEY,
        { algorithm: "HS256" },
    );

    const payload = verifyAccessToken(token);
    assert.deepEqual(payload?.scope, ["read", "write"]);
});

test("signRefreshToken -> verifyRefreshToken round trip (jti present)", async () => {
    await waitForImport();
    const token = signRefreshToken("user-1", "client-1");
    const payload = verifyRefreshToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.ok(payload?.jti, "refresh tokens must have a jti");
    assert.equal(typeof payload?.exp, "number");
});

test("access token rejected as refresh token", async () => {
    await waitForImport();
    const access = signAccessToken("user-1", "client-1");
    assert.equal(verifyRefreshToken(access), null);
});

test("refresh token rejected as access token", async () => {
    await waitForImport();
    const refresh = signRefreshToken("user-1", "client-1");
    assert.equal(verifyAccessToken(refresh), null);
});

test("token signed with a different key is rejected", async () => {
    await waitForImport();
    const other = crypto.randomBytes(32).toString("hex");
    const fake = jwt.sign({ cid: "evil", typ: "access" }, other, {
        algorithm: "HS256",
        subject: "evil-user",
        expiresIn: 60,
    });
    assert.equal(verifyAccessToken(fake), null);
});

test("garbage token is rejected", async () => {
    await waitForImport();
    assert.equal(verifyAccessToken("not-a-jwt"), null);
    assert.equal(verifyAccessToken(""), null);
});

test("expired access token is rejected", async () => {
    await waitForImport();
    const expired = jwt.sign({ cid: "client-1", typ: "access" }, TEST_KEY, {
        algorithm: "HS256",
        subject: "user-1",
        expiresIn: -10,
    });
    assert.equal(verifyAccessToken(expired), null);
});
