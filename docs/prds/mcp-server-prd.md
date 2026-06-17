# MCP Server for MediaLit API

**Issue:** #185
**Status:** Implemented
**Author:** Rajat Saxena
**Date:** 2026-06-13
**Last revised:** 2026-06-17

> ## ✅ OAuth Restart-Safety Revision (2026-06-14) — implemented
>
> The original OAuth implementation in `src/oauth/` used **in-memory `Map`
> storage for access and refresh tokens**, so **every server restart invalidated
> every issued access and refresh token** (DCR client registrations survived).
> Clients had to re-authorize after any restart, deployment, or crash — which
> contradicted the published `refreshTokenLifetime: 30 days`.
>
> **Resolution (now in code):** access and refresh tokens are **stateless
> HS256-signed JWTs** (`src/oauth/jwt.ts`), self-contained and verifiable without
> any state lookup. `src/oauth/model.ts` no longer keeps token `Map`s — only an
> in-memory auth-code `Map` (5-min TTL). Refresh-token revocation is persisted
> in MongoDB so explicit `/oauth/revoke` survives redeploys. See §6.7 for the
> full design.

## 1. Objective

Build a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server, embedded in the MediaLit Express API, that exposes file management capabilities as MCP tools over **Streamable HTTP** transport. This allows AI coding agents (Claude Code, Cursor, etc.) and MCP-compatible clients to list, read, delete, and manage media files programmatically using natural language or tool calls.

## 2. Architecture

### 2.1 Transport: Streamable HTTP (only)

The MCP server uses **Streamable HTTP** transport — a single HTTP POST endpoint mounted inside the Express app. No stdio, no separate process.

**Why Streamable HTTP:**

- No separate process to manage — one `pnpm dev` starts everything
- Reuses existing Express port, TLS certificate, and middleware stack
- MCP clients connect via URL: `http://localhost:8000/mcp` (dev) or `https://api.medialit.cloud/mcp` (production)
- Auth via both the existing `apikey` middleware (CLI/agent clients) and OAuth 2.0 (browser-based/ChatGPT clients)

### 2.2 Integration with Express

The MCP server supports two authentication paths. CLI and agent clients (Claude Code, Cursor) use the existing `x-medialit-apikey` header. Browser-based clients and OAuth-only clients (ChatGPT connectors) use the OAuth 2.0 Authorization Code + PKCE flow.

The OAuth 2.0 Authorization Server is a **standalone generic module** at `src/oauth/` — not tied to MCP. It exposes endpoints at `/oauth/*` that any consumer (MCP, web frontend, mobile app) can use. There are **no** MCP-specific `/mcp/authorize` / `/mcp/token` aliases — MCP clients discover the `/oauth/*` endpoints through `/.well-known/oauth-authorization-server`, so no backward-compat alias was needed.

```
  ┌──────────────────────────────────────────────────────────────┐
  │ Express API (port 8000)                                      │
  │                                                              │
  │  /media/*    →  REST routes (multipart + TUS upload)          │ ◄── upload files
  │  /settings/* →  REST routes                                  │
  │                                                              │
  │  ── OAuth 2.0 Authorization Server (standalone) ────────    │
  │  /.well-known/oauth-authorization-server  →  metadata        │ ◄── OAuth discovery
  │  /oauth/authorize     →  authorization page (OTP login)      │ ◄── user login
  │  /oauth/token         →  token exchange / refresh            │ ◄── get access token
  │  /oauth/revoke        →  token revocation                    │ ◄── logout
  │  /oauth/userinfo      →  current OAuth user profile          │ ◄── web session user
  │  /oauth/register      →  DCR (RFC 7591)                      │ ◄── client registration
  │                                                              │
  │  ── MCP transport ──────────────────────────────────────    │
  │  /mcp  →  MCP Streamable HTTP transport                      │ ◄── tools here
  │            (auth: Bearer token OR x-medialit-apikey)         │
  └──────────┬───────────────────────────────────────────────────┘
             │
             │  Path A — API key clients (Claude Code, Cursor)
             │  POST /mcp  +  x-medialit-apikey: <key>
             │
             │  Path B — OAuth clients (ChatGPT, web, mobile)
             │  POST /mcp  +  Authorization: Bearer ***
             ▼
  ┌──────────────────────────────────┐
  │ MCP Client                       │
  │ (Claude Code / Cursor / ChatGPT) │
  └──────────────────────────────────┘
```

- The MCP transport is mounted as Express middleware at `/mcp`
- A unified auth middleware checks for `Authorization: Bearer ***` first, then falls back to `x-medialit-apikey`
- `apps/api/src/index.ts` mounts `mcp/routes.ts`; that router owns the OAuth discovery/routes and the MCP transport route
- The OAuth server is mounted at `/oauth/*` (and `/.well-known/oauth-authorization-server` for discovery); there are no `/mcp/*` OAuth aliases
- MCP tools call service-layer functions directly — no HTTP calls to self
- Always enabled, no feature flag

### 2.3 Upload Flow

File uploads are supported via two paths:

**Path A — REST API (multipart):** The existing `POST /media/create` endpoint accepts binary files as multipart/form-data. Suitable for large files and direct client uploads.

**Path B — MCP tool (base64):** The `upload_media` MCP tool accepts files encoded as base64 strings in a JSON-RPC call. The server decodes the base64 content, writes it to a temp file, and calls the same `mediaService.upload()` function used by the REST route. Suitable for AI agents uploading small-to-medium files inline.

**Path C — TUS resumable upload:** The `POST /media/create/resumable` TUS endpoint accepts resumable uploads and finalizes them through the same media service path.

```
  ┌──────────┐    multipart upload     ┌──────────────┐
  │  Client  │ ──────────────────────→ │ /media/create│
  │  (REST)  │                         │  (REST)      │
  │          │     returns media       └──────────────┘
  │          │ ←──────────────────────
  │          │
  │  Client  │  POST /mcp (JSON-RPC)
  │  (MCP)   │  { upload_media, base64... }
  │          │ ──────────────────────────→  upload_media tool
  │          │ ←──────────────────────────  returns media
  │          │                            (record is now temp=true)
  │          │
  │  Client  │  POST /mcp (JSON-RPC)
  │          │  { seal_media, mediaId }
  │          │ ──────────────────────────→  seal_media tool
  │          │ ←──────────────────────────  (temp flag cleared,
  │          │                              now visible to list_media)
  │          │
  │  Client  │  POST /mcp (JSON-RPC)
  │          │  { list_media, group, ... }
  │          │ ──────────────────────────→  list_media tool
  │          │ ←──────────────────────────  returns { mediaItems }
  └──────────┘
```

**Rationale for base64 in MCP:**

- MCP transport (Streamable HTTP) uses JSON-RPC — not designed for binary file transfer
- Base64 encoding allows file bytes to be embedded in the JSON payload
- REST multipart and MCP uploads share the same `mediaService.upload()` implementation, ensuring consistent processing (WebP conversion, thumbnails, S3 upload)
- REST multipart, TUS, and MCP uploads all call `validateUploadConstraints()` so account storage limits and per-file size limits are enforced consistently before storage work begins

**Two-step upload (temp → sealed):**

Every record created by `mediaService.upload()` is flagged `temp: true` in the database. Records with `temp: true` are **excluded** from `list_media`, `get_media_count`, `get_total_storage`, and `get_paginated_media` queries (the `getPaginatedMedia` / `getMediaCount` filters in `src/media/queries.ts` apply `temp: { $ne: true }`). To make a record permanently visible, the caller must invoke `seal_media` with the returned `mediaId`. The `seal` operation `$unset`s the `temp` field.

This is the same two-step behavior as the existing REST API (`POST /media/create` → `POST /media/seal/{mediaId}`), preserved for consistency. The temp flag also enables a periodic cleanup sweep (`src/media/cleanup.ts`) that deletes orphaned temp records older than a configurable TTL.

> **Callout:** If an agent calls `upload_media` and the new file does not appear in `list_media`, the most common cause is that `seal_media` was not called. Always pair `upload_media` with `seal_media` unless the upload is intentionally a draft.

### 2.4 Why not stdio

Remote HTTP is strictly better for this use case:

- **Single deployment:** The MCP endpoint ships with the API — no separate binary, no extra infra
- **Auth reuse:** The same middleware stack protects both REST and MCP endpoints
- **Client flexibility:** Claude Code, Cursor, IDE plugins, ChatGPT connectors, and custom UIs all connect the same way
- **No process lifecycle management:** The MCP server lives and dies with the Express process

## 3. File Structure

```
apps/api/src/
├── mcp/
│   ├── routes.ts           ← Express router for OAuth discovery/routes, CORS,
│   │                          rate limiting, MCP auth, and /mcp sessions
│   ├── server.ts           ← Creates McpServer with StreamableHTTPTransport,
│   │                          imports + registers all tools
│   └── tools/
│       ├── media.ts        ← list_media, get_media, get_media_count,
│       │                      get_total_storage, delete_media, seal_media
│       ├── responses.ts    ← Shared MCP error responses
│       ├── schemas.ts      ← Shared output schemas for structuredContent
│       ├── signature.ts    ← create_upload_signature
│       ├── settings.ts     ← get_media_settings, update_media_settings
│       └── upload.ts       ← upload_media
│
├── oauth/
│   ├── routes.ts           ← Express Router for /.well-known and /oauth/*
│   ├── server.ts           ← OAuth2Server instance
│   ├── model.ts            ← AuthorizationCodeModel (in-memory auth codes,
│   │                          JWT access/refresh tokens, DCR persistence)
│   ├── authorize-page.ts   ← Templated authorization HTML page
│   ├── jwt.ts              ← (NEW) HS256 sign/verify helpers
│   ├── pending-auth-model.ts
│   ├── client-model.ts
│   ├── revoked-token-model.ts
│   └── middleware.ts       ← Express middleware for Bearer token
│                              introspection on any route
│
├── auth/
│   ├── resolve-auth.ts     ← Shared resolver: Bearer token OR
│   │                          x-medialit-apikey
│   └── middleware.ts       ← Shared REST/MCP auth middleware factory
│
└── (rest of API structure)
```

The OAuth module is a **standalone generic OAuth 2.0 Authorization Server** — it has no dependency on MCP. Any consumer (MCP tools, web frontend API routes, mobile app backends) can import `oauth/middleware.ts` to validate Bearer tokens or call `oauth/model.ts` directly for token introspection.

The shared auth middleware (`auth/middleware.ts`) imports from the oauth module to validate Bearer tokens and exposes REST and MCP adapters — it is a consumer of the generic OAuth server, not part of it.

## 4. Dependencies

Current `apps/api/package.json` dependencies:

| Package                     | Version  | Purpose                                    |
| --------------------------- | -------- | ------------------------------------------ |
| `@modelcontextprotocol/sdk` | ^1.29.0  | MCP server, StreamableHTTPTransport, types |
| `@node-oauth/oauth2-server` | ^5.3.0   | OAuth 2.0 Authorization Code + PKCE server |
| `jsonwebtoken`              | ^9.0.2   | HS256 access-token signing                 |
| `express-rate-limit`        | ^7.5.0   | OAuth and MCP rate limiting                |
| `zod`                       | ^3.25.76 | MCP and OAuth boundary validation          |

`@node-oauth/oauth2-server` handles the OAuth 2.0 protocol logic (authorization code flow, token issuance, PKCE verification, refresh token rotation). `jsonwebtoken` handles the **stateless verification of access tokens** issued by the model (see §6.7).

## 5. Tool Specification

> **Output contract:** Every tool that declares an `outputSchema` MUST also return a `structuredContent` field on success matching that schema. The server's output validation layer rejects any tool call whose success return omits `structuredContent` with `MCP error -32602: Output validation error`. The `content` text field is preserved for backward compatibility (clients may read the same data from either path) but is no longer the source of truth.

### 5.1 Media

| Tool Name           | Calls                       | Input Parameters                                                                                | Description                                     |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `list_media`        | `mediaService.getPage()`    | `page?` (number, ≥1), `limit?` (number, ≥1), `access?` ("public"\|"private"), `group?` (string) | List media files with optional filters          |
| `get_media`         | `getMediaDetails()` handler | `mediaId` (string, required)                                                                    | Get metadata for a specific media file          |
| `get_media_count`   | `getMediaCount()` handler   | none                                                                                            | Get total number of media files                 |
| `get_total_storage` | `getTotalSpace()` handler   | none                                                                                            | Get total storage used and max storage in bytes |
| `delete_media`      | `deleteMedia()` handler     | `mediaId` (string, required)                                                                    | Permanently delete a media file                 |
| `seal_media`        | `sealMedia()` handler       | `mediaId` (string, required)                                                                    | Mark a media file as finalized/processed        |

**Output:**

- `list_media` returns `structuredContent: { mediaItems }`, where `mediaItems` is the current page of media list items. The text content is the JSON array for backward-compatible clients.
- `get_media` returns the full media object. `structuredContent` is the same media object and follows `mediaSchema`.
- `get_media_count` returns `{ count }`.
- `get_total_storage` returns `{ storage, maxStorage }`, both in bytes.
- `delete_media` returns `{ message: SUCCESS }`.
- `seal_media` returns the sealed media object.

**Sealed-only filter (applies to the list/count/storage tools in this section):** The query helpers `getMediaCount`, `getTotalSpace`, and `getPaginatedMedia` in `src/media/queries.ts` filter out records that are still flagged `temp: true`. Newly uploaded records (via REST `POST /media/create`, TUS, or MCP `upload_media`) are created with `temp: true` and become visible to `list_media` / `get_media_count` / `get_total_storage` only **after** `seal_media` is invoked. See §2.3 for the full temp → seal flow.

**Exception — `get_media`:** `getMedia` (the single-item lookup) does **not** apply the `temp: { $ne: true }` filter (the filter is intentionally commented out in `src/media/queries.ts`). This lets a caller fetch and inspect a freshly uploaded draft by its `mediaId` _before_ sealing it.

### 5.2 Upload Signature

| Tool Name                 | Calls                         | Input Parameters  | Description                                        |
| ------------------------- | ----------------------------- | ----------------- | -------------------------------------------------- |
| `create_upload_signature` | `generateSignature()` handler | `group?` (string) | Generate an HMAC signature for client-side uploads |

**Output:** `{ signature }` — the HMAC signature value. `structuredContent: { signature }` is required on success.

### 5.3 Settings

| Tool Name               | Calls                  | Input Parameters                                                                                                    | Description                                |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `get_media_settings`    | Media settings handler | none                                                                                                                | Get current media processing configuration |
| `update_media_settings` | Media settings handler | `useWebP?` (boolean), `webpOutputQuality?` (number, 0–100), `thumbnailWidth?` (number), `thumbnailHeight?` (number) | Update media processing configuration      |

**Output:**

- `get_media_settings` returns the full settings object: `{ useWebP, webpOutputQuality, thumbnailWidth, thumbnailHeight }`.
- `update_media_settings` returns `{ message: SUCCESS }`.

### 5.4 Upload

| Tool Name      | Calls                   | Input Parameters                                                                                                                                                                                                                                                      | Auth     | Annotations                                     | Description                                                   |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `upload_media` | `mediaService.upload()` | `fileBase64` (string, required — base64-encoded file content), `fileName` (string, required — filename with extension), `mimeType` (string, required — MIME type), `caption` (string, optional), `access` ("public"\|"private", optional), `group` (string, optional) | Required | `destructiveHint: false`, `openWorldHint: true` | Upload a file to MediaLit storage from base64-encoded content |

The tool decodes the base64 string into a `Buffer`, writes it to a temp file in `os.tmpdir()`, constructs a file-like object with a `mv()` method, validates file size and account storage via `validateUploadConstraints()`, and calls `mediaService.upload()`. The temp file is removed in a `finally` block after the upload completes or fails. It then fetches the uploaded media details and returns the full media object in `structuredContent`.

> **Two-step upload:** The record returned by `upload_media` is created with `temp: true` and is **not** visible to `list_media` / `get_media_count` / `get_total_storage` until the caller invokes `seal_media` with the returned `mediaId`. See §2.3 and §5.1. A typical agent workflow is: `upload_media` → `seal_media` (and then optionally `list_media` / `get_media` to confirm).

## 6. OAuth 2.0 Authorization Server

The authentication system has two independent mechanisms that can be used together or separately:

- **OAuth 2.0 Authorization Code + PKCE** — A generic, standalone OAuth 2.0 Authorization Server module at `src/oauth/`. Used by ChatGPT MCP connectors, the web frontend (`apps/web`), and future mobile apps.
- **API Key (legacy)** — The existing `x-medialit-apikey` header auth, used by CLI/agent clients (Claude Code, Cursor). Handled by the shared auth resolver in `src/auth/resolve-auth.ts`.

Both mechanisms resolve to the same internal `userId` before tools execute.

### 6.1 Generic OAuth 2.0 Authorization Server (`src/oauth/`)

The OAuth server is a **standalone module** with no dependency on MCP. It implements the Authorization Code flow with PKCE (RFC 7636) using `@node-oauth/oauth2-server`. No client secrets are needed — PKCE replaces them for public clients.

User identity comes from the existing email-based OTP/magic link login (the User model).

**Module structure:**

```
src/oauth/
├── routes.ts         ← Express Router
│                        Endpoints: /oauth/authorize, /oauth/token,
│                        /oauth/revoke, /oauth/userinfo, /oauth/register
├── server.ts         ← OAuth2Server instance
├── model.ts          ← AuthorizationCodeModel
│                        (in-memory auth-codes; JWT access + refresh tokens)
├── jwt.ts            ← HS256 sign/verify helpers, payload shape, key loading
├── authorize-page.ts ← Templated HTML authorization page
├── pending-auth-model.ts ← MongoDB-backed pending OTP/OAuth sessions
├── client-model.ts   ← MongoDB-backed dynamic client registrations
├── revoked-token-model.ts ← MongoDB-backed revoked refresh-token JTIs
└── middleware.ts     ← Express middleware: validate Bearer token
                         on any route (returns userId or null)
```

**Standardized endpoints:**

| Endpoint                                  | Method | Purpose                                     |
| ----------------------------------------- | ------ | ------------------------------------------- |
| `/.well-known/oauth-authorization-server` | GET    | OAuth discovery metadata                    |
| `/oauth/authorize`                        | GET    | Authorization page (OTP login)              |
| `/oauth/authorize/send-otp`               | POST   | Send OTP email                              |
| `/oauth/authorize/verify-otp`             | POST   | Verify OTP + issue auth code                |
| `/oauth/token`                            | POST   | Token exchange & refresh                    |
| `/oauth/userinfo`                         | GET    | Current OAuth user's `{ sub, email, name }` |
| `/oauth/revoke`                           | POST   | Token revocation                            |
| `/oauth/register`                         | POST   | Dynamic client registration (RFC 7591)      |

The `src/oauth/` module is mounted by `src/mcp/routes.ts`, which is then mounted once from `src/index.ts` with `app.use(mcpRoutes)`. No MCP-specific `/mcp/authorize` / `/mcp/token` / `/mcp/revoke` aliases exist — they were considered for backward compat but never needed, since MCP clients discover the `/oauth/*` endpoints via `/.well-known/oauth-authorization-server`.

`/oauth/register` is public for MCP client compatibility, but is rate-limited and accepts only public PKCE clients. Registered redirect URIs must be HTTPS, except localhost or loopback development URLs, and must not contain fragments or credentials.

### 6.2 API Key Auth (legacy)

Unchanged from the original design. Used by Claude Code, Cursor, and any programmatic client that can set custom HTTP headers. Defined in `src/auth/resolve-auth.ts` and exposed through the shared middleware factory in `src/auth/middleware.ts`.

| Header              | Value       | Validated against                                   |
| ------------------- | ----------- | --------------------------------------------------- |
| `x-medialit-apikey` | `<api-key>` | Database (User model, existing `apikey` middleware) |

Flow:

1. Client sends `POST /mcp` with `x-medialit-apikey: <key>`
2. Auth middleware detects the header and delegates to existing `apikey` validation
3. On success: `req.user` is populated, tools execute
4. On failure: HTTP 401

### 6.3 Supported Client Types

| Client                    | Type         | Auth Method | Grant Type         | Client Registration                             |
| ------------------------- | ------------ | ----------- | ------------------ | ----------------------------------------------- |
| ChatGPT / MCP             | Confidential | PKCE + OTP  | authorization_code | DCR (RFC 7591) or static pre-registration       |
| Web frontend (`apps/web`) | Public       | PKCE + OTP  | authorization_code | First-party (pre-registered, e.g. `web-client`) |
| Mobile app (future)       | Public       | PKCE + OTP  | authorization_code | DCR (RFC 7591)                                  |
| CLI / Script (future)     | Public       | Device Code | device_code        | Dynamic                                         |

**First-party clients** (web frontend, mobile app) are pre-registered in the OAuth model with known client IDs and redirect URIs. They use the same OAuth flow as third-party clients — no special bypass. The web frontend uses a custom PKCE flow with HTTP-only session cookies instead of NextAuth.

### 6.4 Authorization Flow (OTP)

The authorization endpoint is split into two stages. Our code owns the user-identity stage (OTP login); the library owns the code-generation stage.

**Stage 1 — User login (our code):**

1. Client redirects to `GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...`
2. Server validates `client_id` and exact `redirect_uri` against registered clients
3. Server stashes the full query string (including PKCE parameters) in a short-lived session (TTL: 10 minutes)
4. Server renders an HTML login page — user enters their email address
5. Server sends an OTP/magic link email
6. User enters OTP; server validates it and resolves a `userId`

**Stage 2 — Code generation (library):**

7. After successful OTP verification, server calls the library's `authorize()` middleware passing the resolved `user` object
8. The library calls `saveAuthorizationCode()` on our model, which stores the code with `{ userId, redirectUri, codeChallenge, codeChallengeMethod, expiresAt }`
9. The library redirects to `redirect_uri?code=<code>&state=<state>`

**Error responses** redirect to `redirect_uri?error=<error>&error_description=<desc>&state=<state>`.

### 6.5 Usage by Consumers

#### 6.5.1 MCP Client (ChatGPT / Claude Code)

1. Client registers via DCR (`POST /oauth/register`) or uses a static client ID
2. Client initiates OAuth flow via the authorization page, user authenticates with OTP
3. Client receives authorization code and exchanges it at `POST /oauth/token` for an access token
4. Client sends the access token as `Authorization: Bearer ***` on every MCP request (`POST /mcp`)
5. The MCP auth middleware exported from `src/auth/middleware.ts` validates the token through `src/auth/resolve-auth.ts`, which calls `oauth/middleware.ts`'s `validateBearerToken()`

#### 6.5.2 Web Frontend (`apps/web`)

The Next.js frontend replaces NextAuth with a small first-party OAuth client:

1. `apps/web/auth.ts` exposes `auth()` and `signOut()` helpers backed by HTTP-only cookies. `auth()` reads `session_user` and `session_access_token`; `signOut()` revokes `session_refresh_token`, clears local session cookies, and redirects to `/login`.
2. `apps/web/middleware.ts` protects application routes. It allows `/login`, `/api/auth/callback/medialit`, `/api/auth/signout`, static assets, and cleanup APIs, and redirects unauthenticated users to `/login`.
3. If the access token is missing, expired, or near expiry while a refresh token exists, middleware calls `POST /oauth/token` with `grant_type=refresh_token` and `client_id=web-client`, then stores the rotated `session_access_token` and `session_refresh_token` cookies.
4. `apps/web/app/login/route.ts` starts the PKCE flow by generating `state`, `code_verifier`, and `code_challenge`, storing the verifier in a short-lived HTTP-only `oauth_code_verifier` cookie, and redirecting to `/oauth/authorize`.
5. `apps/web/app/api/auth/callback/medialit/route.ts` exchanges the authorization code at `/oauth/token`, calls `/oauth/userinfo`, stores `session_access_token`, `session_refresh_token`, and `session_user`, clears `oauth_code_verifier`, and redirects to `/`.
6. `apps/web/app/api/auth/signout/route.ts` revokes the refresh token at `/oauth/revoke`, clears `session_access_token`, `session_refresh_token`, and `session_user`, and redirects to `/login`.

#### 6.5.3 Mobile App (future)

1. Registers as an OAuth client via DCR (`POST /oauth/register`)
2. Opens the system browser to `GET /oauth/authorize` with PKCE
3. After authorization, receives redirect with code and exchanges it for tokens at `POST /oauth/token`
4. Stores the refresh token securely and uses access tokens for API calls
5. Server-side API routes validate Bearer tokens via `oauth/middleware.ts`

### 6.6 Auth Middleware Pattern

The OAuth middleware at `src/oauth/middleware.ts` provides token introspection for any Express route:

```typescript
import { verifyAccessToken } from "./jwt";

export async function validateBearerToken(
    bearer: string,
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
    return verifyAccessToken(bearer);
}
```

This is used by `src/auth/resolve-auth.ts` for REST and MCP requests and can be used by any other consumer (web API routes, mobile app backends, etc.).

### 6.7 OAuth Model & Server Configuration — **REVISED 2026-06-14**

#### 6.7.1 Problem statement (was)

The pre-revision `oauthModel` stored all tokens in **process-local `Map` instances**:

```typescript
// src/oauth/model.ts (BEFORE)
const authorizationCodes = new Map<string, StoredAuthorizationCode>(); // ✅ OK — 5 min TTL
const accessTokens = new Map<string, StoredAccessToken>(); // ❌ lost on restart
const refreshTokens = new Map<string, StoredRefreshToken>(); // ❌ lost on restart
```

Tokens were **opaque random hex strings** (`crypto.randomBytes(32).toString("hex")`) with no internal structure — the server **had to look them up in its Map** to validate. Every server restart, crash, or redeploy wiped the Maps, immediately invalidating every access token and every refresh token in flight. This contradicts the published 30-day `refreshTokenLifetime`, so a client that successfully refreshed on day 1 would be silently broken on day 2 if the server restarted even once in between.

#### 6.7.2 Resolution — stateless signed access tokens (HS256 JWT)

Replace the in-memory access-token store with **HMAC-SHA-256 (HS256) JSON Web Tokens** that are self-contained and verifiable without any state lookup. The server signs them once at issuance and verifies the signature on every request. No Map. No restart invalidation.

| Store              | Pre-revision                        | Post-revision                                                                                                             |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Auth codes**     | In-memory `Map` (5 min TTL)         | **In-memory `Map` (5 min TTL)** — unchanged. Codes are single-use and short-lived; restart loss is acceptable.            |
| **Access tokens**  | In-memory `Map` (opaque random hex) | **Signed JWT, HS256** (stateless, verified via `jsonwebtoken`)                                                            |
| **Refresh tokens** | In-memory `Map` (opaque random hex) | **Signed JWT, HS256, type=`refresh`** — verifiable on its own; persistent MongoDB `jti` deny-list for explicit revocation |

**Why HS256 (symmetric) and not RS256/ES256 (asymmetric)?** MediaLit's OAuth is a single-tenant system — the same server that signs a token is the only server that verifies it. HS256 is simpler, faster, smaller, and has no key-distribution problem. Asymmetric keys only matter in multi-tenant/federated setups where a resource server needs to verify tokens without holding the signing key.

#### 6.7.3 Signing-key management

The signing key is loaded from environment variable `OAUTH_SIGNING_KEY`. The server refuses to start if the variable is missing or shorter than 32 bytes (256 bits — the minimum recommended HS256 key length per RFC 7518 §3.2).

**Boot-time validation (in `src/index.ts` `checkConfig()`):**

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

**Key rotation policy:** A single `OAUTH_SIGNING_KEY` is used for both signing and verification. For rotation, deploy with a comma-separated list `OAUTH_SIGNING_KEY=<new>,<old>`. The first key signs new tokens; all listed keys are accepted for verification, so old tokens remain valid until they naturally expire. Once all old tokens have expired, drop the old key from the list.

#### 6.7.4 Token payload shape

```typescript
// Access token (HS256 JWT)
interface AccessTokenPayload {
    sub: string; // userId
    cid: string; // clientId
    typ: "access"; // discriminator
    scope: string; // OAuth space-delimited scope string; default: ""
    iat: number; // issued-at (seconds)
    exp: number; // expires-at (seconds)
}

// Refresh token (HS256 JWT)
interface RefreshTokenPayload {
    sub: string; // userId
    cid: string; // clientId
    typ: "refresh"; // discriminator
    jti: string; // unique id, optional — used for revocation
    iat: number;
    exp: number; // 30 days from issuance
}
```

Claims are kept minimal — the JWT is **not** a session store, it's a capability assertion. There is no need to encode full user profile data, granted authorities beyond the `sub`, or anything else. If we later need server-side introspection (e.g. to invalidate a stolen token before its `exp`), the `jti` is the lookup key.

#### 6.7.5 New module: `src/oauth/jwt.ts`

```typescript
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const KEYS = (process.env.OAUTH_SIGNING_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SIGNING_KEY = KEYS[0]; // first key signs new tokens
const VERIFY_KEYS = KEYS; // all keys accepted for verification (rotation)

const ACCESS_TOKEN_TTL = Number(process.env.TOKEN_TTL_SECONDS) || 900;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

export function signAccessToken(
    userId: string,
    clientId: string,
    scope: string[] = [],
): string {
    return jwt.sign(
        { sub: userId, cid: clientId, typ: "access", scope: scope.join(" ") },
        SIGNING_KEY,
        { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL, noTimestamp: false },
    );
}

export function signRefreshToken(userId: string, clientId: string): string {
    return jwt.sign(
        {
            sub: userId,
            cid: clientId,
            typ: "refresh",
            jti: randomUUID(),
        },
        SIGNING_KEY,
        { algorithm: "HS256", expiresIn: REFRESH_TOKEN_TTL },
    );
}

/**
 * Verify a token (access OR refresh). Returns the decoded payload on success,
 * or null if the signature is invalid, the token is expired, or the type
 * does not match `expectedType`.
 */
export function verifyToken(
    token: string,
    expectedType: "access" | "refresh",
): { sub: string; cid: string; scope: string[]; jti?: string } | null {
    for (const key of VERIFY_KEYS) {
        try {
            const decoded = jwt.verify(token, key, {
                algorithms: ["HS256"],
            }) as any;
            if (decoded.typ !== expectedType) return null;
            return {
                sub: decoded.sub,
                cid: decoded.cid,
                scope: normalizeScope(decoded.scope),
                jti: decoded.jti,
            };
        } catch {
            // try next key
        }
    }
    return null;
}

export function verifyAccessToken(token: string) {
    return verifyToken(token, "access");
}

export function verifyRefreshToken(token: string) {
    return verifyToken(token, "refresh");
}

function normalizeScope(scope: unknown): string[] {
    if (Array.isArray(scope)) {
        return scope.filter((item): item is string => typeof item === "string");
    }
    if (typeof scope === "string") {
        return scope.split(/\s+/).filter(Boolean);
    }
    return [];
}
```

#### 6.7.6 Revised `oauthModel`

The model's responsibilities shrink dramatically — it no longer needs to store or look up tokens. It only handles:

- Client registration (DCR persistence) — **unchanged**
- Authorization code storage (short-lived, in-memory is fine) — **unchanged**
- PKCE verification — handled by the library, not the model
- Token **issuance** — now just signs JWTs and returns them to the library
- Token **revocation** — only refresh tokens are tracked in a persisted MongoDB deny-list (for explicit `/oauth/revoke` support); access tokens expire naturally

```typescript
// src/oauth/model.ts (AFTER)
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt";
import OauthRevokedToken from "./revoked-token-model";

export const oauthModel: OAuth2Server.AuthorizationCodeModel = {
    // ... getClient, saveAuthorizationCode, getAuthorizationCode, revokeAuthorizationCode
    // ... unchanged from before ...

    async saveToken(token, client, user) {
        const userId = String((user as any).id);
        const clientId = (client as any).id;

        const accessToken = signAccessToken(userId, clientId);
        const refreshToken = signRefreshToken(userId, clientId);

        return {
            accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            refreshToken,
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
            scope: token.scope,
            client: { id: clientId },
            user: { id: userId },
            custom: { userId },
        } as OAuth2Server.Token;
    },

    async getAccessToken(accessToken) {
        const payload = verifyAccessToken(accessToken);
        if (!payload) return null;
        return {
            accessToken,
            accessTokenExpiresAt: new Date(payload.exp * 1000),
            scope: payload.scope,
            client: { id: payload.cid },
            user: { id: payload.sub },
        } as StoredAccessToken;
    },

    async getRefreshToken(refreshToken) {
        const payload = verifyRefreshToken(refreshToken);
        if (!payload) return null;
        if (
            payload.jti &&
            (await OauthRevokedToken.findOne({ jti: payload.jti }).lean())
        ) {
            return null;
        }
        return {
            refreshToken,
            refreshTokenExpiresAt: new Date(payload.exp * 1000),
            scope: payload.scope,
            client: { id: payload.cid },
            user: { id: payload.sub },
        } as StoredRefreshToken;
    },

    async revokeToken(token: StoredRefreshToken) {
        const payload = verifyRefreshToken(token.refreshToken);
        if (payload?.jti) {
            await OauthRevokedToken.updateOne(
                { jti: payload.jti },
                {
                    $setOnInsert: {
                        jti: payload.jti,
                        tokenType: "refresh_token",
                        userId: payload.sub,
                        clientId: payload.cid,
                        expiresAt: token.refreshTokenExpiresAt,
                        revokedAt: new Date(),
                    },
                },
                { upsert: true },
            );
        }
        return true;
    },
};
```

**Key behavior changes:**

| Scenario                                  | Pre-revision                                                | Post-revision                                                  |
| ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Server restart, valid access token        | ❌ Rejected (`invalid_token`)                               | ✅ Still valid (signature + `exp` only)                        |
| Server restart, valid refresh token       | ❌ Rejected (`invalid_grant`)                               | ✅ Still valid (signature + `exp` + not in deny-list)          |
| Server restart, valid auth code           | ❌ Rejected (but it was already expired after 5 min anyway) | ❌ Rejected (same) — acceptable                                |
| Token `exp` reached                       | ❌ Rejected (sweep in 5 min)                                | ✅ Rejected immediately (verified at use)                      |
| Explicit `/oauth/revoke` of refresh token | ✅ Denied                                                   | ✅ Denied via persisted deny-list (`jti`)                      |
| Explicit `/oauth/revoke` of access token  | ⚠️ Best-effort only                                         | ⚠️ Still best-effort (JWT is stateless) — documented in §6.7.7 |
| Two API instances behind a load balancer  | ❌ Tokens don't transfer between instances                  | ✅ Any instance can verify any token (stateless)               |
| Compromised signing key                   | ❌ Attacker can mint tokens indefinitely                    | ✅ Rotate `OAUTH_SIGNING_KEY`; old tokens expire naturally     |
| Token theft before `exp`                  | ⚠️ Cannot revoke                                            | ⚠️ Same — `jti` deny-list only for refresh tokens              |

#### 6.7.7 Access-token revocation: known limitation

JWT access tokens **cannot be selectively revoked before their `exp`**. The `/oauth/revoke` endpoint can deny-list a refresh token (via its `jti`), but revoking an access token before it naturally expires is not possible without a per-token server-side lookup — which is the token-store problem this revision is avoiding for normal API requests.

This is an accepted, industry-standard trade-off. The mitigations are:

- Access tokens are short-lived (15 minutes by default).
- Logout (`/oauth/revoke`) always revokes the refresh token, so the next refresh fails — the client must re-authorize.
- Stolen access tokens are only useful for the remaining token lifetime. After that, the attacker needs the refresh token (which has been revoked).
- Clients can be told to drop their cached access token on logout, which closes the window further.

If a need arises to revoke access tokens in real time (e.g. compliance "right to be forgotten"), the path is: add a `jti` to every access token and a Redis-backed deny-list to the `verifyAccessToken` helper. This is a future enhancement, not in scope for this revision.

#### 6.7.8 Other model changes (incidental, recommended as part of this revision)

While we're in the file, fix the following pre-existing issues:

1. **Refresh tokens must be rotated on use.** Set `alwaysIssueNewRefreshToken: true` on the `OAuth2Server` (already done in current code — confirm).
2. **Pending OAuth/OTP sessions are persisted to MongoDB** — the `oauthpendingauths` collection stores the short-lived authorization-page state with a TTL index, so the flow works across API restarts and multiple API instances.
3. **Authorization code storage remains in-memory** — codes are 5-minute, single-use, and there's nothing of value to persist.
4. **The `TOKEN_TTL_SECONDS` env var is the source of truth for access-token lifetime.** No new env var is needed for the refresh-token lifetime (it's hard-coded to 30 days; if we need to make it configurable later, that's a separate change).

#### 6.7.9 Migration Plan (additive)

| Step | What                                                                                                                                                                                                                                            | Impact                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Add `OAUTH_SIGNING_KEY` to `.env` (generate with `openssl rand -base64 48`)                                                                                                                                                                     | New env var; no functional change yet                                                                                                                                                                             |
| 2    | Add boot-time validation in `src/index.ts` `checkConfig()`                                                                                                                                                                                      | Server refuses to start without the key — fail-fast                                                                                                                                                               |
| 3    | Create `src/oauth/jwt.ts` with `signAccessToken` / `signRefreshToken` / `verifyToken` helpers                                                                                                                                                   | New file, no behavior change                                                                                                                                                                                      |
| 4    | Refactor `src/oauth/model.ts`: remove `accessTokens` and `refreshTokens` Maps; rewire `saveToken` / `getAccessToken` / `getRefreshToken` / `revokeToken` to use the JWT helpers; persist revoked refresh-token JTIs in MongoDB with a TTL index | **All existing tokens are invalidated** at the moment of deploy — clients must re-authorize once. This is the same one-time pain as the current restart behavior, except it happens exactly once and never again. |
| 5    | Add unit tests for `jwt.ts` (sign/verify/exp/type-mismatch/wrong-key/deny-list)                                                                                                                                                                 | Required for any change that touches crypto                                                                                                                                                                       |
| 6    | Verify the existing `validateBearerToken` contract in `oauth/middleware.ts` still returns the same shape it used to (userId). Document the new return type `{ userId, clientId, scopes }`.                                                      | The shared auth middleware should pick up `clientId` and `scopes` opportunistically for MCP requests (no breaking change — REST callers ignore them)                                                              |
| 7    | Update `.env.example` with the new variable and a doc comment on how to generate it                                                                                                                                                             | Docs only                                                                                                                                                                                                         |

**No DCR client data is affected** — dynamic-client registrations are persisted to the MongoDB `oauthclients` collection and are independent of the token store.

#### 6.7.10 Configuration (post-revision)

```typescript
// src/oauth/server.ts
const oauth = new OAuth2Server({
    model: oauthModel,
    allowEmptyState: true,
    allowExtendedTokenAttributes: true,
    accessTokenLifetime: Number(process.env.TOKEN_TTL_SECONDS) || 900,
    refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
    authorizationCodeLifetime: 5 * 60,
    requireClientAuthentication: {
        authorization_code: false,
        refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true, // rotate refresh tokens on use
});
```

| Store                   | Value                                                                                         | Lifetime                                          | Survives restart? |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------- |
| Auth code               | `{ userId, redirectUri, codeChallenge, codeChallengeMethod }`                                 | 5 minutes                                         | ❌ (acceptable)   |
| Pending OAuth/OTP state | `{ pendingId, clientId, redirectUri, otpHash, ... }` persisted to MongoDB `oauthpendingauths` | 10 minutes                                        | ✅                |
| Access token            | Signed JWT, stateless verification                                                            | 15 minutes (configurable via `TOKEN_TTL_SECONDS`) | ✅                |
| Refresh token           | Signed JWT, persisted `jti` deny-list in MongoDB `oauthrevokedtokens`                         | 30 days                                           | ✅                |
| DCR client registration | `{ clientId, redirectUris, grantTypes, ... }` persisted to MongoDB `oauthclients`             | Indefinite                                        | ✅                |

### 6.8 Implemented Migration Shape

| Step | What                                                                                                                                                                      | Impact                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | Create `src/oauth/` module — move `oauth-model.ts` → `oauth/model.ts`, split `oauth-server.ts` into `oauth/server.ts` + `oauth/authorize-page.ts` + `oauth/middleware.ts` | No functional change — imports still work                                                 |
| 2    | Split OAuth routing into `src/oauth/routes.ts` and keep the `OAuth2Server` instance in `src/oauth/server.ts`                                                              | Router code and server initialization have separate ownership                             |
| 3    | Mount `src/mcp/routes.ts` once from `src/index.ts`; `mcp/routes.ts` mounts OAuth discovery/routes and `/mcp`                                                              | `index.ts` stays thin; MCP-specific CORS/session handling lives in the MCP folder         |
| 4    | Replace legacy web auth with the `apps/web` custom PKCE client that uses `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, and `/oauth/revoke`                       | Web frontend uses the generic OAuth server without NextAuth                               |
| 5    | Add pre-registered first-party clients (`web-client`, `mobile-app`) to the model                                                                                          | New clients work out of the box                                                           |
| 6    | Do not expose legacy `/mcp/authorize`, `/mcp/token`, or `/mcp/revoke` aliases                                                                                             | OAuth clients discover the standard `/oauth/*` endpoints                                  |
| 7    | **(2026-06-14, this revision)** Replace in-memory token store with stateless signed JWTs (see §6.7)                                                                       | Solves restart invalidation bug; **all in-flight tokens invalidated once at deploy time** |

## 7. Implementation Phases

### Phase 1: Mount the Transport + Read-Only MVP

**Goal:** MCP endpoint live at `/mcp` with read-only tools, testable via MCP Inspector using API key auth.

Steps:

1. Install `@modelcontextprotocol/sdk`
2. Create `mcp/server.ts` — `new McpServer({ name: "MediaLit", version: "1.0.0" })` with `StreamableHTTPServerTransport`
3. Register read-only tools: `list_media`, `get_media`, `get_media_count`, `get_total_storage`, `get_media_settings` (note: the `health_check` tool that shipped in the original rollout was removed in the Phase 3.5 cleanup — server reachability is now verified by the existing `/health` REST endpoint)
4. Create `auth/middleware.ts` with API key path only (OAuth path stubbed)
5. Mount in `apps/api/src/index.ts` through the MCP router:

    ```typescript
    import mcpRoutes from "./mcp/routes";

    app.use(mcpRoutes);
    ```

6. Test with MCP Inspector:
    ```bash
    npx @modelcontextprotocol/inspector \
      --transport http \
      --url http://localhost:8000/mcp \
      -H "x-medialit-apikey: <your-api-key>"
    ```

**Deliverables:** All read tools functional via HTTP, API key auth working, Inspector passing.

### Phase 2: Write Tools

**Goal:** Full CRUD — delete, seal, signature, settings update, and direct upload.

Steps:

7. Implement `delete_media`, `seal_media`, `create_upload_signature`, `update_media_settings`, `upload_media`

**Deliverables:** All 10 tools functional, end-to-end tested with real files. (Originally 11 tools, including `health_check`; that tool was removed in the Phase 3.5 cleanup — server reachability is verified via the existing `/health` REST endpoint.)

### Phase 3: Generic OAuth 2.0 Authorization Server

**Goal:** Standalone OAuth 2.0 Authorization Code + PKCE flow at `/oauth/*`, usable by MCP, web, and mobile.

Steps:

8. Install `@node-oauth/oauth2-server`
9. Create `src/oauth/` module:
    - `model.ts` — `AuthorizationCodeModel` backed by in-memory authorization-code storage, stateless JWT access/refresh tokens, and DCR persistence in MongoDB `oauthclients`
    - `server.ts` — create the `OAuth2Server` instance with `allowEmptyState: true`, `allowExtendedTokenAttributes: true`, public-client token exchange, and refresh-token rotation
    - `routes.ts` — export the Express router for `/.well-known/oauth-authorization-server`, `GET /oauth/authorize`, `POST /oauth/token`, `GET /oauth/userinfo`, `POST /oauth/revoke`, `POST /oauth/register`
    - `authorize-page.ts` — extract the inline HTML into a templated module
    - `middleware.ts` — generic `validateBearerToken()` for any Express route
10. Build the Stage 1 authorization handler — email input → OTP send → OTP verify → call library's `authorize()` middleware with resolved user
11. Mount the OAuth router from `mcp/routes.ts` before the `/mcp` transport route, with no auth required for OAuth flow endpoints
12. Wire the `Authorization: Bearer` path into `auth/middleware.ts` using `auth/resolve-auth.ts`
13. Keep OAuth implementation out of `src/mcp/`; MCP consumes the generic OAuth module through shared auth middleware
14. Test the full flow using MCP Inspector OAuth mode
15. Connect ChatGPT MCP connector and verify end-to-end

**Deliverables:** OAuth flow complete at `/oauth/*`, ChatGPT connector working, both auth paths tested, no MCP-specific OAuth aliases.

### Phase 3.5: OAuth Restart-Safety Hardening (2026-06-14, **this revision**)

**Goal:** Tokens survive server restart, deployment, crash, and horizontal scaling. Solves the bug where `hermes mcp login` works once, then the token becomes invalid on the next server restart, forcing the user to re-authorize.

Steps:

16. Generate a 48-byte signing key and add it to `.env` as `OAUTH_SIGNING_KEY`
17. Add boot-time validation in `src/index.ts` `checkConfig()` — refuse to start without the key (≥32 bytes)
18. Create `src/oauth/jwt.ts` with `signAccessToken`, `signRefreshToken`, `verifyToken`, `verifyAccessToken`, `verifyRefreshToken` (HS256)
19. Refactor `src/oauth/model.ts`:
    - Remove `accessTokens` and `refreshTokens` `Map` instances
    - `saveToken` — sign access+refresh JWTs, return them with correct `accessTokenExpiresAt` / `refreshTokenExpiresAt`
    - `getAccessToken` — verify JWT, return synthetic `StoredAccessToken` shape
    - `getRefreshToken` — verify JWT, check persisted deny-list, return synthetic `StoredRefreshToken` shape
    - `revokeToken` — persist `jti` in MongoDB `oauthrevokedtokens`
    - Keep `authorizationCodes` Map and `setInterval` sweep unchanged
20. Update `src/oauth/middleware.ts` to use the new `verifyAccessToken` helper, return `{ userId, clientId, scopes }`
21. Update `src/auth/middleware.ts` to consume the new richer return type (pick up `clientId` and `scopes` opportunistically for MCP mode — no breaking change)
22. Add unit tests in `apps/api/src/oauth/__tests__/jwt.test.ts` covering: sign/verify round-trip, expired token, wrong key, type mismatch, key rotation; add model tests for persisted refresh-token revocation
23. Update `.env.example` with `OAUTH_SIGNING_KEY=<value>` and a doc comment
24. End-to-end smoke test: `hermes mcp login` → get a token → restart the server → confirm the same token still works on the next `tools/list` call

**Deliverables:** Tokens survive server restart, deploys, crashes. One-time invalidation at deploy time is acceptable and documented. Unit tests in place for the JWT layer.

### Phase 4: Polish & Testing

**Goal:** Production quality — tests, validation, error handling.

Steps:

25. Add Zod input schema validation to all tools
26. Create `__tests__/mcp/` with unit tests for tool schemas and OAuth model methods
27. Audit error messages — `isError: true` with actionable text on all tool failures
28. Add `TOKEN_TTL_SECONDS` to `.env.example`
29. Ensure every tool with `outputSchema` returns matching `structuredContent`
30. Add file-size and account-storage constraint tests for REST multipart, TUS, and MCP upload paths

**Deliverables:** Test suite, validation, production-ready error handling.

### Phase 5: Web & Mobile Migration

**Goal:** Migrate the Next.js frontend and enable mobile app support via the generic OAuth server.

Steps:

31. Add first-party client entries (`web-client`, `mobile-app`) to the OAuth model's static clients
32. Expose `/oauth/*` routes and discovery from `mcp/routes.ts`
33. Keep MCP-specific OAuth code out of `src/mcp/`; MCP requests resolve OAuth through `auth/resolve-auth.ts`
34. Replace the web frontend auth with the custom PKCE client: `auth.ts` cookie session helpers, `/login` PKCE redirect, `/api/auth/callback/medialit` token exchange + userinfo lookup, middleware refresh-token rotation, and `/api/auth/signout` revocation
35. Test the web frontend login flow end-to-end
36. Verify MCP Inspector, ChatGPT connector, and Claude Code all still work

**Deliverables:** Generic OAuth server serving all clients, web frontend migrated, mobile-ready, no legacy MCP OAuth aliases.

## 8. Error Handling

All tools return errors as MCP content results with `isError: true`:

```typescript
{
  content: [{ type: "text", text: "Failed to fetch media: mediaId not found" }],
  isError: true,
}
```

**Error categories:**

- **Auth errors (401):** Returned by `mcpAuth` middleware before tools run — MCP client sees HTTP 401
- **OAuth errors (400):** Returned by the library per RFC 6749 (`error` + `error_description` JSON)
- **Not found:** "Media not found: {mediaId}"
- **Validation:** Zod schema validation failures with field-level detail
- **Service errors:** Errors from handlers/queries/S3 propagated with descriptive messages

## 9. Testing

| Test Type                   | Tool                                                                                 | Frequency                |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| **MCP Inspector (API key)** | Manual, `http://localhost:8000/mcp` + `x-medialit-apikey` header                     | During dev               |
| **MCP Inspector (OAuth)**   | Manual, OAuth mode → full authorize → token → tool calls                             | Phase 3                  |
| **ChatGPT connector**       | Add MediaLit MCP via ChatGPT settings, run tool calls in conversation                | Phase 3 (manual)         |
| **Unit tests**              | `node:test` on tool schema validation, OAuth model methods, **JWT layer**            | CI                       |
| **Integration tests**       | Local API instance + Inspector tool call chain                                       | CI (Phase 4)             |
| **E2E with Claude Code**    | `claude mcp add medialit --url http://localhost:8000/mcp` → natural language queries | Manual, before PR merge  |
| **Restart-safety smoke**    | Login → kill server → restart server → call `tools/list` with the cached token       | Every deploy (Phase 3.5) |

## 10. Integration Guide

### Mount in Express

In `apps/api/src/index.ts`, mount the MCP router after REST routes:

```typescript
import mcpRoutes from "./mcp/routes";

app.use("/settings/media", mediaSettingsRoutes(passport));
app.use("/media/signature", signatureRoutes);
app.use("/media", tusRoutes);
app.use("/media", mediaRoutes);
app.use(mcpRoutes);
```

`mcp/routes.ts` mounts the OAuth discovery/routes, applies MCP CORS and rate limiting, authenticates `/mcp` with the shared `mcpAuth` middleware, and manages Streamable HTTP sessions.

The MCP transport and OAuth endpoints are always active — no feature flag.

### Connect with Claude Code (API key)

```bash
claude mcp add --transport http medialit https://api.medialit.cloud/mcp \
  --header "x-medialit-apikey: <your-api-key>"
```

### Connect with Cursor (API key)

In Cursor settings → MCP Servers → Add:

```
URL: https://api.medialit.cloud/mcp
Headers: { "x-medialit-apikey": <your-api-key> }
```

### Connect with ChatGPT (OAuth)

ChatGPT MCP connectors require OAuth 2.0 — API keys are not supported. Use the OAuth flow:

1. In ChatGPT settings → Connectors → Add connector → Custom
2. Enter the MCP server URL: `https://api.medialit.cloud/mcp`
3. ChatGPT fetches `/.well-known/oauth-authorization-server` to discover endpoints
4. ChatGPT redirects you to `https://api.medialit.cloud/oauth/authorize` with a PKCE challenge
5. Enter your MediaLit email address — you receive an OTP/magic link
6. Complete login — you are redirected back to ChatGPT with an authorization code
7. ChatGPT exchanges the code at `POST /oauth/token` for an access token
8. All subsequent MCP requests use `Authorization: Bearer ***`
9. Access tokens expire after 15 minutes by default; ChatGPT automatically refreshes using the refresh token

No API key is needed for this flow.

### Connect with OAuth-Based MCP Clients (Programmatic)

```typescript
// 1. Discover endpoints
const meta = await fetch(
    "https://api.medialit.cloud/.well-known/oauth-authorization-server",
).then((r) => r.json());

// 2. Generate PKCE pair
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

// 3. Redirect user to authorization URL
const authUrl = new URL(meta.authorization_endpoint);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", "my-app");
authUrl.searchParams.set("redirect_uri", "https://myapp.com/oauth/callback");
authUrl.searchParams.set("code_challenge", challenge);
authUrl.searchParams.set("code_challenge_method", "S256");
authUrl.searchParams.set("state", crypto.randomBytes(16).toString("hex"));
// → redirect user to authUrl.toString()

// 4. After callback, exchange code for token
const tokens = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callbackCode,
        redirect_uri: "https://myapp.com/oauth/callback",
        client_id: "my-app",
        code_verifier: verifier,
    }),
}).then((r) => r.json());

// 5. Use access token with MCP client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport({
    url: "https://api.medialit.cloud/mcp",
    headers: { Authorization: `Bearer ${tokens.access_token}` },
});
const client = new Client({ name: "my-app", version: "1.0.0" });
await client.connect(transport);
```

### Connect Programmatically with API Key

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport({
    url: "https://api.medialit.cloud/mcp",
    headers: { "x-medialit-apikey": "<api-key>" },
});
const client = new Client({ name: "my-app", version: "1.0.0" });
await client.connect(transport);
```

## 11. Future Considerations

- **Resource exposure:** Expose media files as MCP resources (`media://{mediaId}`) so Claude can reference them by URI
- **Prompts:** Add MCP prompt templates for common workflows ("upload via REST, then manage via MCP", "list recent uploads")
- **Pagination helper:** Convenience tool that fetches all pages of `list_media` for full inventory
- **Bulk operations:** Batch delete, batch seal
- **Rate limiting:** Per-key and per-token rate limiting for MCP endpoint
- **Logging:** Structured MCP request logging (separate from REST logs for observability)
- **Access-token revocation (real-time):** Add a `jti` to every access token and a Redis-backed deny-list for `verifyAccessToken`. Solves the "right to be forgotten" / stolen-token case. Deferred from this revision per §6.7.7.
- **Configured OAuth issuer:** Use an explicit `OAUTH_ISSUER` / `API_SERVER` value for authorization-server metadata instead of deriving issuer URLs from `Host` / `X-Forwarded-Host` headers.
- **JWT issuer/audience claims:** Add and validate `iss` and `aud` claims on OAuth access and refresh tokens.
- **Asymmetric keys (RS256/ES256):** Switch from HS256 to RS256/ES256 when we need a separate resource server (e.g. a CDN edge worker) to verify tokens without holding the signing key
- **Dynamic client registration (already done):** RFC 7591 endpoint so third-party apps can register without a code change
- **Scopes:** Fine-grained OAuth scopes (`mcp:read`, `mcp:write`) to allow read-only OAuth clients. Current OAuth access is effectively full account access.
- **Versioned transport:** Support multiple protocol versions if MCP spec evolves
- **Auto-seal on upload:** Add an optional `seal: true` parameter to `upload_media` that atomically uploads and seals in a single call. Useful for simple agents that don't need the draft/temp stage. The default (no `seal` arg) must remain the current two-step flow to preserve parity with the REST API.
