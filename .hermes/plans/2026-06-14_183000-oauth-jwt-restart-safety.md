# OAuth Restart-Safety Hardening — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make OAuth access and refresh tokens survive server restarts, deployments, crashes, and horizontal scaling. Fixes the bug where `hermes mcp login` works once, then the token becomes invalid on the next server restart.

**Architecture:** Replace the in-memory `Map`-based token store in `src/oauth/model.ts` with stateless signed JWTs (HS256) verified by `jsonwebtoken`. The signing key comes from a new `OAUTH_SIGNING_KEY` env var. Refresh tokens get an optional `jti` deny-list for explicit revocation.

**Tech Stack:** TypeScript, Node.js 20+, Express 4, `@node-oauth/oauth2-server` ^5.3.0, `jsonwebtoken` (already installed transitively).

**Reference:** `apps/api/docs/mcp-server-prd.md` §6.7 (revised 2026-06-14)

---

## Task 0: Pre-flight — generate signing key

**Objective:** Create a 48-byte (384-bit) base64 signing key and add it to `.env` so the server can boot with the new validation.

**Files:**

- Modify: `apps/api/.env`

**Step 1: Generate the key**

Run:

```bash
cd ~/dev/proj/medialit/apps/api
openssl rand -base64 48
```

Expected: A 64-character base64 string (≈56 chars after line breaks, may include `=` padding).

**Step 2: Add to .env**

Append (or set) the key in `apps/api/.env`:

```bash
echo "OAUTH_SIGNING_KEY=<paste-key-here>" >> .env
```

**Step 3: Verify**

```bash
grep OAUTH_SIGNING_KEY .env
```

Expected: One line showing the variable (key will be redacted in tool output).

**Step 4: Commit (no commit — env file is gitignored)**

Skip the commit. `.env` is git-ignored.

---

## Task 1: Add boot-time validation in `src/index.ts`

**Objective:** Refuse to start the server if `OAUTH_SIGNING_KEY` is missing or shorter than 32 bytes. Fail-fast principle.

**Files:**

- Modify: `apps/api/src/index.ts` (`checkConfig()` function around line 246)

**Step 1: Add validation block**

In `checkConfig()` (the async function around line 246 in `src/index.ts`), append a new validation block at the end of the existing checks (after the CLOUD/CDN block, before the closing `}` of the function):

```typescript
if (
    !process.env.OAUTH_SIGNING_KEY ||
    Buffer.byteLength(process.env.OAUTH_SIGNING_KEY, "utf8") < 32
) {
    throw new Error(
        "OAUTH_SIGNING_KEY is required and must be at least 32 bytes (256 bits). " +
            "Generate one with: openssl rand -base64 48",
    );
}
```

**Step 2: Verify the change**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to `src/index.ts`.

**Step 3: Smoke test the failure mode**

```bash
cd ~/dev/proj/medialit/apps/api
OAUTH_SIGNING_KEY="" node --env-file=.env --import tsx src/index.ts 2>&1 | head -5
```

Expected: Error containing "OAUTH_SIGNING_KEY is required". Kill the process with Ctrl-C.

**Step 4: Smoke test the success mode**

```bash
cd ~/dev/proj/medialit/apps/api
node --env-file=.env --import tsx src/index.ts > /tmp/medialit-api.log 2>&1 &
sleep 3
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok","uptime":...}`. Kill the server when done.

**Step 5: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/index.ts
git commit -m "feat(oauth): require OAUTH_SIGNING_KEY env var at boot"
```

---

## Task 2: Create `src/oauth/jwt.ts`

**Objective:** Centralize all JWT signing and verification in a single module. Pure functions, no Express, no model coupling.

**Files:**

- Create: `apps/api/src/oauth/jwt.ts`

**Step 1: Create the file**

```typescript
import jwt from "jsonwebtoken";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Key loading (supports key rotation: comma-separated list, first key signs)
// ---------------------------------------------------------------------------

const KEYS = (process.env.OAUTH_SIGNING_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SIGNING_KEY = KEYS[0]; // first key signs new tokens
const VERIFY_KEYS = KEYS; // all keys accepted for verification (rotation)

// ---------------------------------------------------------------------------
// TTLs (mirrors src/oauth/server.ts configuration)
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_TTL = Number(process.env.MCP_TOKEN_TTL_SECONDS) || 3600;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

// ---------------------------------------------------------------------------
// Token payload shapes
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
    sub: string; // userId
    cid: string; // clientId
    typ: "access";
    scope: string[];
    iat: number;
    exp: number;
}

export interface RefreshTokenPayload {
    sub: string;
    cid: string;
    typ: "refresh";
    jti: string;
    iat: number;
    exp: number;
}

export interface VerifiedToken {
    sub: string;
    cid: string;
    scope: string[];
    jti?: string;
}

// ---------------------------------------------------------------------------
// Signers
// ---------------------------------------------------------------------------

export function signAccessToken(
    userId: string,
    clientId: string,
    scope: string[] = [],
): string {
    return jwt.sign({ cid: clientId, typ: "access", scope }, SIGNING_KEY, {
        algorithm: "HS256",
        subject: userId,
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

export function signRefreshToken(userId: string, clientId: string): string {
    return jwt.sign(
        { cid: clientId, typ: "refresh", jti: crypto.randomUUID() },
        SIGNING_KEY,
        {
            algorithm: "HS256",
            subject: userId,
            expiresIn: REFRESH_TOKEN_TTL,
        },
    );
}

// ---------------------------------------------------------------------------
// Verifier (tries each key in rotation list, then returns null on failure)
// ---------------------------------------------------------------------------

export function verifyToken(
    token: string,
    expectedType: "access" | "refresh",
): VerifiedToken | null {
    for (const key of VERIFY_KEYS) {
        try {
            const decoded = jwt.verify(token, key, {
                algorithms: ["HS256"],
            }) as Record<string, unknown>;

            if (decoded.typ !== expectedType) return null;
            if (
                typeof decoded.sub !== "string" ||
                typeof decoded.cid !== "string"
            ) {
                return null;
            }
            return {
                sub: decoded.sub,
                cid: decoded.cid,
                scope: Array.isArray(decoded.scope)
                    ? (decoded.scope as string[])
                    : [],
                jti: typeof decoded.jti === "string" ? decoded.jti : undefined,
            };
        } catch {
            // Try next key (rotation). Any verify error (expired, bad sig,
            // bad algorithm) falls through to the next key, and ultimately
            // returns null.
        }
    }
    return null;
}

export function verifyAccessToken(token: string): VerifiedToken | null {
    return verifyToken(token, "access");
}

export function verifyRefreshToken(token: string): VerifiedToken | null {
    return verifyToken(token, "refresh");
}

// ---------------------------------------------------------------------------
// Helpers for callers (e.g. model.ts) that need the TTL in ms
// ---------------------------------------------------------------------------

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL;
```

**Step 2: Verify the file compiles**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

**Step 3: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/oauth/jwt.ts
git commit -m "feat(oauth): add HS256 JWT signer/verifier helpers"
```

---

## Task 3: Write unit tests for `jwt.ts`

**Objective:** Verify sign/verify, expiry, type mismatch, wrong key, and key rotation. Required for any code that touches crypto.

**Files:**

- Create: `apps/api/src/oauth/__tests__/jwt.test.ts`

**Step 1: Check what test runner is used**

```bash
cd ~/dev/proj/medialit/apps/api
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('scripts:', json.dumps(d.get('scripts',{}), indent=2))"
```

Expected: Look for a `test` script. If it uses `node:test`, use that. If `jest`, use that. If nothing, use `node:test` (built into Node 20+, no extra dep).

Assume `node:test` (Node's built-in test runner) for the example. If the project uses something else, adapt.

**Step 2: Create the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

// We must set OAUTH_SIGNING_KEY BEFORE importing jwt.ts
const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env.OAUTH_SIGNING_KEY = TEST_KEY;

const {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    verifyToken,
} = await import("../jwt.js");

// -- round trip -----------------------------------------------------------

test("signAccessToken → verifyAccessToken round trip", () => {
    const token = signAccessToken("user-1", "client-1", ["read", "write"]);
    const payload = verifyAccessToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.deepEqual(payload?.scope, ["read", "write"]);
});

test("signRefreshToken → verifyRefreshToken round trip (jti present)", () => {
    const token = signRefreshToken("user-1", "client-1");
    const payload = verifyRefreshToken(token);
    assert.equal(payload?.sub, "user-1");
    assert.equal(payload?.cid, "client-1");
    assert.ok(payload?.jti, "refresh tokens must have a jti");
});

// -- type mismatch -------------------------------------------------------

test("access token rejected as refresh token", () => {
    const access = signAccessToken("user-1", "client-1");
    assert.equal(verifyRefreshToken(access), null);
});

test("refresh token rejected as access token", () => {
    const refresh = signRefreshToken("user-1", "client-1");
    assert.equal(verifyAccessToken(refresh), null);
});

// -- tampered / wrong-key token ------------------------------------------

test("token signed with a different key is rejected", () => {
    const other = crypto.randomBytes(32).toString("hex");
    const fake = require("jsonwebtoken").sign(
        { cid: "evil", typ: "access" },
        other,
        { algorithm: "HS256", subject: "evil-user", expiresIn: 60 },
    );
    assert.equal(verifyAccessToken(fake), null);
});

test("garbage token is rejected", () => {
    assert.equal(verifyAccessToken("not-a-jwt"), null);
    assert.equal(verifyAccessToken(""), null);
});

// -- expired token -------------------------------------------------------

test("expired access token is rejected", async () => {
    // Sign an already-expired token directly
    const jwt = require("jsonwebtoken");
    const expired = jwt.sign({ cid: "client-1", typ: "access" }, TEST_KEY, {
        algorithm: "HS256",
        subject: "user-1",
        expiresIn: -10,
    });
    assert.equal(verifyAccessToken(expired), null);
});

// -- key rotation --------------------------------------------------------

test("verifier accepts tokens signed with any key in the rotation list", async () => {
    const oldKey = crypto.randomBytes(32).toString("hex");
    const newKey = crypto.randomBytes(32).toString("hex");

    // Re-import with both keys set
    process.env.OAUTH_SIGNING_KEY = `${oldKey},${newKey}`;
    // Bust the import cache
    const { signAccessToken: sign2, verifyAccessToken: verify2 } = await import(
        `../jwt.js?ts=${Date.now()}`
    );

    const token = sign2("user-1", "client-1");
    const payload = verify2(token);
    assert.equal(payload?.sub, "user-1");

    // Restore single-key state for downstream tests
    process.env.OAUTH_SIGNING_KEY = TEST_KEY;
});
```

**Step 3: Run the tests**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsx --test src/oauth/__tests__/jwt.test.ts 2>&1 | tail -30
```

Expected: All tests pass.

If `npx tsx --test` doesn't work with the test runner, use the alternate form:

```bash
node --import tsx --test src/oauth/__tests__/jwt.test.ts
```

**Step 4: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/oauth/__tests__/jwt.test.ts
git commit -m "test(oauth): cover jwt signer/verifier (round-trip, expiry, rotation)"
```

---

## Task 4: Refactor `src/oauth/model.ts` to use JWTs

**Objective:** Remove the in-memory `accessTokens` and `refreshTokens` Maps. Rewire `saveToken`, `getAccessToken`, `getRefreshToken`, `revokeToken` to use the JWT helpers. Add a `refreshTokenDenylist` Set for explicit revocation.

**Files:**

- Modify: `apps/api/src/oauth/model.ts`

**Step 1: Add the deny-list and import the JWT helpers**

At the top of `src/oauth/model.ts` (after the existing imports, around line 6), add:

```typescript
import {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
} from "./jwt";

// In-memory deny-list of revoked refresh-token jti values.
// Reset on server restart — that's acceptable per the PRD: clients must
// re-authorize if their token was revoked just before a crash, and the
// access-token lifetime is short enough that the window is small.
const refreshTokenDenylist = new Set<string>();
```

**Step 2: Remove the old Maps and their TTL sweep**

Delete the three in-memory `Map` declarations (around lines 42-44):

```typescript
// REMOVE THESE THREE LINES:
// const authorizationCodes = new Map<string, StoredAuthorizationCode>();
// const accessTokens = new Map<string, StoredAccessToken>();
// const refreshTokens = new Map<string, StoredRefreshToken>();
```

Keep the `authorizationCodes` Map and its TTL sweep. Only delete the `accessTokens` and `refreshTokens` Maps.

In the `setInterval` block (around lines 50-71), remove the `accessTokens` and `refreshTokens` loops. Keep only the `authorizationCodes` loop:

```typescript
setInterval(
    () => {
        const now = new Date();
        for (const [code, data] of authorizationCodes) {
            if (data.expiresAt < now) authorizationCodes.delete(code);
        }
    },
    5 * 60 * 1000,
);
```

**Step 3: Replace `saveToken`**

Replace the existing `saveToken` (around lines 273-308) with:

```typescript
    async saveToken(
        token: Partial<OAuth2Server.Token>,
        client: OAuth2Server.Client,
        user: OAuth2Server.User,
    ): Promise<OAuth2Server.Token> {
        const userId = String((user as any).id);
        const clientId = String((client as any).id);
        const scope = token.scope;

        const accessToken = signAccessToken(userId, clientId, scope);
        const refreshToken = signRefreshToken(userId, clientId);

        return {
            accessToken,
            accessTokenExpiresAt: new Date(
                Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
            ),
            refreshToken,
            refreshTokenExpiresAt: new Date(
                Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
            ),
            scope,
            client,
            user,
            custom: { userId },
        };
    },
```

**Step 4: Replace `getAccessToken`**

Replace the existing `getAccessToken` (around lines 310-323) with:

```typescript
    async getAccessToken(
        accessToken: string,
    ): Promise<StoredAccessToken | null> {
        const payload = verifyAccessToken(accessToken);
        if (!payload) return null;
        return {
            accessToken,
            accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
            scope: payload.scope,
            client: { id: payload.cid } as OAuth2Server.Client,
            user: { id: payload.sub } as OAuth2Server.User,
        };
    },
```

**Step 5: Replace `getRefreshToken`**

Replace the existing `getRefreshToken` (around lines 325-338) with:

```typescript
    async getRefreshToken(
        refreshToken: string,
    ): Promise<StoredRefreshToken | null> {
        const payload = verifyRefreshToken(refreshToken);
        if (!payload) return null;
        if (payload.jti && refreshTokenDenylist.has(payload.jti)) return null;
        return {
            refreshToken,
            refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
            scope: payload.scope,
            client: { id: payload.cid } as OAuth2Server.Client,
            user: { id: payload.sub } as OAuth2Server.User,
        };
    },
```

**Step 6: Replace `revokeToken`**

Replace the existing `revokeToken` (around lines 340-345) with:

```typescript
    async revokeToken(token: StoredRefreshToken): Promise<boolean> {
        const payload = verifyRefreshToken(token.refreshToken);
        if (payload?.jti) {
            refreshTokenDenylist.add(payload.jti);
        }
        return true;
    },
```

**Step 7: Verify the file compiles**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors. If the `StoredAccessToken` / `StoredRefreshToken` types complain about missing fields, add a `// @ts-ignore` or extend the interface — they only need the fields the library actually reads.

**Step 8: Run the JWT unit tests (should still pass)**

```bash
cd ~/dev/dev/proj/medialit/apps/api
npx tsx --test src/oauth/__tests__/jwt.test.ts 2>&1 | tail -20
```

Expected: All 7 tests still pass.

**Step 9: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/oauth/model.ts
git commit -m "refactor(oauth): use stateless HS256 JWTs instead of in-memory token Maps"
```

---

## Task 5: Update `src/oauth/middleware.ts` to use the new helper

**Objective:** Make `validateBearerToken` use the new `verifyAccessToken` helper and return the richer shape `{ userId, clientId, scopes }`.

**Files:**

- Modify: `apps/api/src/oauth/middleware.ts`

**Step 1: Replace the file contents**

````typescript
import { verifyAccessToken } from "./jwt";

/**
 * Generic Bearer token validator for any Express route.
 *
 * Returns `{ userId, clientId, scopes }` if the token is valid, or null if
 * the signature is invalid, the token is expired, or the type is not "access".
 *
 * Use this in any route handler that needs OAuth token validation.
 *
 * @example
 * ```typescript
 * import { validateBearerToken } from "../oauth/middleware";
 *
 * app.get("/api/protected", async (req, res) => {
 *     const auth = req.headers.authorization?.match(/^Bearer (.+)$/i);
 *     if (!auth) return res.status(401).json({ error: "unauthorized" });
 *     const claims = await validateBearerToken(auth[1]);
 *     if (!claims) return res.status(401).json({ error: "invalid_token" });
 *     // claims.userId, claims.clientId, claims.scopes available
 * });
 * ```
 */
export async function validateBearerToken(
    bearer: string,
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
    const payload = verifyAccessToken(bearer);
    if (!payload) return null;
    return {
        userId: payload.sub,
        clientId: payload.cid,
        scopes: payload.scope,
    };
}
````

**Step 2: Verify the file compiles**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

**Step 3: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/oauth/middleware.ts
git commit -m "refactor(oauth): middleware returns richer { userId, clientId, scopes }"
```

---

## Task 6: Update `src/mcp/auth-middleware.ts` for the new return shape

**Objective:** Pick up `clientId` and `scopes` from the new `validateBearerToken` return value. The existing `mcpAuth` middleware already accepts an `Authorization: Bearer *** header — it just needs to use the new fields instead of looking them up via `getApiKeyByUserId`.

**Files:**

- Modify: `apps/api/src/mcp/auth-middleware.ts`

**Step 1: Read the current file**

```bash
cd ~/dev/proj/medialit/apps/api
cat src/mcp/auth-middleware.ts
```

**Step 2: Update the Bearer-token branch**

In the `Authorization: Bearer *** branch (look for the line that calls `validateBearerToken`or`oauthModel.getAccessToken`), update the assignment to use the new richer return:

```typescript
// Path A: OAuth Bearer token
const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
if (bearer) {
    const claims = await validateBearerToken(bearer);
    if (!claims) return res.status(401).json({ error: "invalid_token" });
    req.userId = claims.userId;
    req.clientId = claims.clientId;
    req.scopes = claims.scopes;
    // ... rest of the existing API-key resolution logic unchanged
}
```

Keep all the existing API-key lookup logic for the `x-medialit-apikey` path and the downstream consumer. The OAuth path just sets the new fields.

**Step 3: Verify the file compiles**

```bash
cd ~/dev/proj/medialit/apps/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

**Step 4: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/src/mcp/auth-middleware.ts
git commit -m "refactor(mcp): consume new { userId, clientId, scopes } from oauth middleware"
```

---

## Task 7: End-to-end restart-safety smoke test

**Objective:** Prove the bug is fixed. Login → kill server → restart server → use the cached token → confirm `tools/list` succeeds.

**Files:**

- None (read-only verification)

**Step 1: Start the server with the new code**

```bash
cd ~/dev/proj/medialit/apps/api
node --env-file=.env --import tsx src/index.ts > /tmp/medialit-api.log 2>&1 &
echo $! > /tmp/medialit-pid
sleep 4
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok","uptime":...}`

**Step 2: Re-do the OAuth login in the background**

```bash
hermes mcp login medialit 2>&1
```

This will print an authorize URL. Open it in a browser, enter your email, ask for the OTP from `/tmp/medialit-api.log` (use `grep -i otp /tmp/medialit-api.log | tail -1`), paste the callback URL back to the terminal.

**Step 3: Confirm a token was issued**

```bash
cat ~/.hermes/mcp-tokens/medialit.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('access_token prefix:', d['access_token'][:10] + '...'); print('refresh_token prefix:', d['refresh_token'][:10] + '...'); print('expires_in:', d.get('expires_in'))"
```

Expected: A valid-looking access token + refresh token, expires_in: 3600.

**Step 4: KILL the server**

```bash
kill $(cat /tmp/medialit-pid)
sleep 2
ps -p $(cat /tmp/medialit-pid) 2>&1 || echo "Server stopped"
```

Expected: "Server stopped" or "process not found".

**Step 5: RESTART the server**

```bash
cd ~/dev/proj/medialit/apps/api
node --env-file=.env --import tsx src/index.ts > /tmp/medialit-api.log 2>&1 &
echo $! > /tmp/medialit-pid
sleep 4
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok","uptime":...}` (a fresh uptime — the new process started).

**Step 6: Use the CACHED token to call the MCP endpoint**

```bash
ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.hermes/mcp-tokens/medialit.json'))['access_token'])")

# Discover session
RESP=$(curl -s -D - -X POST https://clcomp.taile2f1.ts.net/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"restart-safety-test","version":"1.0.0"}}}')
SID=$(echo "$RESP" | grep -i "mcp-session-id" | awk '{print $2}' | tr -d '\r\n')
echo "Session: $SID"

# List tools — this is the test
curl -s -X POST https://clcomp.taile2f1.ts.net/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Mcp-Session-Id: $SID" \
  -H "Mcp-Protocol-Version: 2025-03-26" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python3 -m json.tool | head -20
```

Expected: A JSON response with `"result":{"tools":[...]}` — 11 tools listed. The token is still valid after the server restart. **The bug is fixed.**

If you get `{"error":"invalid_token","error_description":"..."}` then the JWT verification is failing — check the logs and re-check the `jwt.ts` and `model.ts` changes.

**Step 7: Cleanup**

```bash
kill $(cat /tmp/medialit-pid)
rm /tmp/medialit-pid
```

**No commit** — this is a verification step, not a code change.

---

## Task 8: Update `.env.example` with the new variable

**Objective:** Document the new env var so other developers know to set it.

**Files:**

- Create (or modify): `apps/api/.env.example`

**Step 1: Check if `.env.example` exists**

```bash
ls -la ~/dev/proj/medialit/apps/api/.env.example 2>&1
```

If it doesn't exist, create it with the following content. If it does, append a new section.

```bash
# --- OAuth 2.0 (Phase 3.5 — restart-safety hardening) ---
# Signing key for access + refresh tokens. MUST be at least 32 bytes.
# Generate with:  openssl rand -base64 48
# For key rotation, set a comma-separated list — the first key signs new
# tokens, all listed keys are accepted for verification.
OAUTH_SIGNING_KEY=
```

**Step 2: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/.env.example
git commit -m "docs: document OAUTH_SIGNING_KEY in .env.example"
```

---

## Task 9: Commit the updated PRD

**Objective:** The PRD revision lives in `docs/mcp-server-prd.md` — commit it so the source of truth is in version control.

**Step 1: Check git status**

```bash
cd ~/dev/proj/medialit
git status --short
```

Expected: `M apps/api/docs/mcp-server-prd.md` (or similar).

**Step 2: Commit**

```bash
cd ~/dev/proj/medialit
git add apps/api/docs/mcp-server-prd.md
git commit -m "docs(prd): revise §6.7 — replace in-memory token store with HS256 JWTs

Fixes a defect where every server restart invalidated all issued access
and refresh tokens, even though the published refreshTokenLifetime is
30 days. Switches to stateless signed JWTs verified at request time,
with an optional jti deny-list for explicit revocation.

Ref: #185"
```

---

## Post-completion checklist

- [ ] Server refuses to start without `OAUTH_SIGNING_KEY` (Task 1 verified)
- [ ] All 7 unit tests pass (Task 3 verified)
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)
- [ ] End-to-end smoke test passes (Task 7 verified): token survives server restart
- [ ] `.env.example` documents the new variable
- [ ] PRD §6.7 is the source of truth, committed
- [ ] All commits follow the conventional-commits style (`feat:`, `refactor:`, `test:`, `docs:`)
- [ ] The original bug is fixed: `hermes mcp login` works, then the token is still valid after `kill -9` + restart

## Files changed (summary)

| File                                       | Action | Purpose                                         |
| ------------------------------------------ | ------ | ----------------------------------------------- |
| `apps/api/.env`                            | Modify | Add `OAUTH_SIGNING_KEY`                         |
| `apps/api/src/index.ts`                    | Modify | Boot-time validation of `OAUTH_SIGNING_KEY`     |
| `apps/api/src/oauth/jwt.ts`                | Create | HS256 sign/verify helpers                       |
| `apps/api/src/oauth/__tests__/jwt.test.ts` | Create | Unit tests for the JWT layer                    |
| `apps/api/src/oauth/model.ts`              | Modify | Remove in-memory token Maps, use JWT helpers    |
| `apps/api/src/oauth/middleware.ts`         | Modify | New return shape `{ userId, clientId, scopes }` |
| `apps/api/src/mcp/auth-middleware.ts`      | Modify | Consume the new richer return value             |
| `apps/api/.env.example`                    | Modify | Document `OAUTH_SIGNING_KEY`                    |
| `apps/api/docs/mcp-server-prd.md`          | Modify | Source of truth — new §6.7                      |

## Risks and trade-offs

1. **One-time token invalidation at deploy time.** All clients must re-authorize once when this change ships. The PRD documents this as acceptable.
2. **No real-time access-token revocation.** Stolen access tokens can be used until `exp` (1 hour default). The PRD explains the mitigations (short TTL, refresh-token revocation closes the window).
3. **`OAUTH_SIGNING_KEY` must be in `.env` going forward.** A misconfigured production deploy that omits this variable will refuse to start. This is the fail-fast principle — better than silent token-invalidation bugs.
4. **Refresh-token deny-list is in-memory.** A revoked refresh token becomes valid again after a server restart. This is a known, accepted limitation; production-grade revocation needs Redis (out of scope per the PRD's "future considerations").

## Open questions

None — the PRD revision is the final spec. Implementation follows the spec 1:1.
