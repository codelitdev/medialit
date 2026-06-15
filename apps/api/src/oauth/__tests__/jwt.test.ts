import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// We must set OAUTH_SIGNING_KEY BEFORE importing jwt.ts (it reads at module load)
const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env["OAUTH_SIGNING_KEY"] = TEST_KEY;

// Wrap dynamic import in an async IIFE so this works under CJS
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

// -- round trip -----------------------------------------------------------

test("signAccessToken -> verifyAccessToken round trip", async () => {
    await waitForImport();
    const token = signAccessToken("user-1", "client-1", ["read", "write"]);
    const payload = verifyAccessToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.deepEqual(payload?.scope, ["read", "write"]);
});

test("signRefreshToken -> verifyRefreshToken round trip (jti present)", async () => {
    await waitForImport();
    const token = signRefreshToken("user-1", "client-1");
    const payload = verifyRefreshToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.ok(payload?.jti, "refresh tokens must have a jti");
});

// -- type mismatch -------------------------------------------------------

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

// -- tampered / wrong-key token ------------------------------------------

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

// -- expired token -------------------------------------------------------

test("expired access token is rejected", async () => {
    await waitForImport();
    const expired = jwt.sign({ cid: "client-1", typ: "access" }, TEST_KEY, {
        algorithm: "HS256",
        subject: "user-1",
        expiresIn: -10,
    });
    assert.equal(verifyAccessToken(expired), null);
});

// -- key rotation --------------------------------------------------------
//
// Note: testing key rotation end-to-end in-process is not possible because
// jwt.ts reads OAUTH_SIGNING_KEY at module-load time and freezes it in the
// KEYS array. To test rotation, a separate test process (or a different
// file that imports jwt.ts with a pre-set comma-separated env var) is
// required. The rotation behavior is exercised in production by setting
// OAUTH_SIGNING_KEY="new,old" at server start. The verifyToken loop
// itself is exercised by the "token signed with a different key" test
// above (it tries every key in VERIFY_KEYS and rejects if none match).
