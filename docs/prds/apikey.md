# API Key Management

**Status:** Implemented
**Author:** Rajat Saxena
**Date:** 2026-10-17

## 1. Objective

Bring MediaLit's API key handling in line with SendLit and FrontLit:

- Store only hashes, never plaintext.
- Show the secret only once, at creation.
- Allow several revocable keys per app.
- Scope tenant data to the app, not to the key's secret.

Existing integrations must keep working without changes. Today, the only
MediaLit consumers are our own products:

- CourseLit sends the `x-medialit-apikey` header directly.
- FrontLit and SendLit use `medialit@0.2.0`, which also sends the header.

That lets this change remove the legacy body `apikey` field outright (§7).

The same change closes two adjacent gaps:

- Uploads are written to disk before the caller is authenticated.
- Deactivated accounts keep full API access.

It also has to keep **bundled self-hosting** working. SendLit, FrontLit and
CourseLit ship MediaLit inside their own `docker-compose.yml`, and each product
needs a working MediaLit key from its first start, before anyone can open a
dashboard (§6.4).

## 2. Current state

- **One plaintext key per app.** An "app" is a row in `api_keys`
  (`apps/api/src/db/schema/domain.ts`). Its secret is a 21-character nanoid,
  stored in plaintext in `api_keys.key`. `key_id` is the app's public ID, used in
  `/app/[keyid]` URLs and in the OAuth `app_id` claim.
- **The secret doubles as the tenant ID.** `media.apikey`,
  `media_settings.apikey` (globally unique), `signatures.apikey` and
  `tus_uploads.apikey` store the raw secret, and every query filters on it. So
  a key can't be rotated, revoked or hashed without moving the data.
- **Deleting an app does not revoke its key.** `getApiKeyBySecret`
  (`apps/api/src/db/repository.ts`) doesn't filter `deleted`, and the separate
  TUS resolver (`apps/api/src/tus/tus-server.ts`) doesn't check it either. A
  test currently asserts this behaviour.
- **The secret leaks.**
    - `GET /api/apps/:keyId` returns it.
    - The settings page sends it to the browser on every visit.
    - It travels through `req.apikey`, signature rows and the MCP auth context.
- **Dead columns.** `restriction`, `http_referrers` and `ip_addresses` are never
  enforced.
- **Missing features.** There is no rotation, no second key, and no record of
  when a key was last used.
- **Uploads hit disk before authentication.** `POST /media/create` runs
  `fileUpload` before checking credentials (`apps/api/src/media/routes.ts`),
  because the legacy `apikey` field can arrive inside the multipart body. An
  unauthenticated caller can therefore write up to `MAX_UPLOAD_SIZE_SUBSCRIBED`
  (2 GB by default) to the temp directory per request before being rejected.
  The only brake is the per-IP limit of 120 requests per minute.
- **`profiles.active` is never enforced.** The importer and `/api/account`
  carry the flag, but no authentication path reads it. A deactivated account
  keeps working through API keys, OAuth, signatures, TUS and MCP.

## 3. Reference model (SendLit / FrontLit)

Both products keep their own copy of the same design; there is no shared
package. This plan follows SendLit's team keys, with two changes taken from
FrontLit: management is owner-only, and revoking a missing key returns 404.

| Aspect     | Design                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format     | `<product>_live_` + 32 CSPRNG bytes, base64url (256 bits)                                                                                                  |
| Storage    | `key_hash` (SHA-256 hex, unique) and `key_prefix` (the first 12 characters, for display)                                                                   |
| Plaintext  | Returned once, in the create response                                                                                                                      |
| Ownership  | Keys belong to a tenant (a team). Tenant data references the tenant, never the key                                                                         |
| Lookup     | Hash the submitted value; then `key_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`                                        |
| Revocation | Soft, by setting `revoked_at`                                                                                                                              |
| IDs        | `id` is the internal primary key, referenced by every foreign key and never exposed. `<domain>_id` is the public ID and the only one accepted from callers |

Don't copy these SendLit bugs:

- It never writes `last_used_at`.
- The settings list shows revoked keys.
- Revoking a key that doesn't exist returns 204.
- Any team member can manage keys.
- Team keys can mint more keys through MCP.

In MediaLit, the **app** plays the role of SendLit's team.

## 4. Data model

### 4.1 `apps` (renamed from `api_keys`)

| Column                                                                 | Notes                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                   | Internal primary key; unchanged values                                                                                               |
| `app_id`                                                               | Public ID, renamed from `key_id`. Existing values stay as they are, without a prefix, so URLs and OAuth `app_id` claims keep working |
| `name`, `user_id`, `is_default`, `deleted`, `created_at`, `updated_at` | Unchanged                                                                                                                            |
| ~~`key`~~                                                              | Dropped once the backfill is done                                                                                                    |
| ~~`restriction`, `http_referrers`, `ip_addresses`~~                    | Dropped (never enforced)                                                                                                             |

The existing partial unique indexes stay: `(user_id, name)` and the
one-default-per-user index.

### 4.2 `api_keys` (new)

| Column            | Type                   | Notes                                                                      |
| ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| `id`              | text, primary key      | Internal                                                                   |
| `api_key_id`      | text, unique           | Public ID, `ak_<nanoid>`                                                   |
| `app_id`          | text, not null         | Foreign key to `apps.id`, `ON DELETE CASCADE`, indexed                     |
| `name`            | text, not null         |                                                                            |
| `key_hash`        | text, not null, unique | SHA-256 hex of the full secret                                             |
| `key_prefix`      | text, not null         | The first 12 characters of new keys; the first 4 characters of legacy keys |
| `expires_at`      | timestamptz            | Nullable                                                                   |
| `last_used_at`    | timestamptz            | Nullable                                                                   |
| `revoked_at`      | timestamptz            | Nullable                                                                   |
| `created_by_type` | text, not null         | `user`, `bootstrap` or `legacy` (checked by a constraint)                  |
| `created_by_id`   | text                   | User ID, if any                                                            |
| `created_at`      | timestamptz, not null  |                                                                            |

### 4.3 Tenant tables

`media`, `media_settings`, `signatures` and `tus_uploads` replace `apikey` with
`app_id`, a foreign key to `apps.id`. `media_settings.app_id` is unique.
`oauth_app_selections.api_key_id` is renamed to `app_id`.

`signatures` also gets a nullable `api_key_id`, a foreign key to `api_keys.id`
with `ON DELETE CASCADE`, and an index on it. It records which key minted the
signature. It stays null for signatures minted through OAuth or the dashboard.
See §7.1.

As in SendLit, the foreign key columns are named `app_id` but hold the internal
`apps.id`. Only the `apps.app_id` column holds the public ID.

`media_owner_idx` is rebuilt on `(user_id, app_id, temp)` and declared in
`domain.ts`. The current index is in the SQL but missing from the schema.

## 5. Migration (`apps/api/drizzle/0008_api_keys.sql`, hand-written)

All of this runs in a single transaction.

1. Rename `api_keys` to `apps`, `key_id` to `app_id`, and
   `oauth_app_selections.api_key_id` to `app_id`. Renaming a table doesn't
   rename its constraints or indexes, so also rename them to `apps_*`.
   Otherwise the new table's default names would collide with the old ones:

    - `api_keys_pkey`, `api_keys_key_id_key` and `api_keys_key_key`;
    - `api_keys_user_name_uidx` and `api_keys_one_default_uidx`;
    - the foreign key `api_keys_user_id_fkey`;
    - `oauth_app_selections_api_key_id_api_keys_id_fk`.

    Check the actual names with `\d api_keys` first, because the constraints
    in `0001_domain.sql` were created implicitly, without explicit names.

2. Create the new `api_keys` table.
3. **Backfill keys.** For each app, insert one key:

    - `key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex')`
    - `key_prefix = left(key, 4)`
    - `name = 'Default key'`
    - `created_by_type = 'legacy'`
    - `revoked_at = now()` if the app is deleted

    Legacy secrets keep authenticating, because lookup simply hashes whatever is
    submitted. No format check or separate legacy path is needed.

4. **Re-key the tenant tables.** For each of `media`, `media_settings`,
   `signatures` and `tus_uploads`:

    1. Add a nullable `app_id` column.
    2. Fill it: `UPDATE t SET app_id = a.id FROM apps a WHERE a.key = t.apikey`.
    3. If any `media` or `media_settings` row still has a null `app_id`,
       **raise an exception**. Never drop media silently. Rows like this point
       at a key that no longer exists; imported Mongo data is the likely
       source. Unmapped `signatures` and `tus_uploads` rows are deleted
       instead: they expire within days and could never be used.
    4. Set `NOT NULL` and add the foreign key and indexes.
    5. Drop `apikey`.

    For `signatures` only, also set `api_key_id` to the app's backfilled
    legacy key. The old schema can't tell which signatures were minted by a key
    and which by the dashboard, so revoking the legacy key conservatively
    invalidates all of them. Signatures last 24 hours at most, so this is
    harmless.

5. Drop `apps.key`, `restriction`, `http_referrers` and `ip_addresses`.
6. Update `domain.ts` and the Drizzle snapshot so that `db:generate` produces no
   diff.
7. Confirm that PGlite supports `sha256()`. `repository.test.ts` runs the real
   migrations against it.

## 6. API: key primitives and repository

### 6.1 `apps/api/src/apikey/secret.ts`

- `API_KEY_PREFIX = "ml_live_"`
- `generateApiKeySecret()` returns `ml_live_` + `randomBytes(32).toString("base64url")`.
- `hashApiKeySecret(secret)` returns the SHA-256 hex digest.
- `displayPrefix(secret)` returns the first 12 characters, e.g. `ml_live_a1b2`.

### 6.2 `apps/api/src/apikey/queries.ts`

This replaces the current file.

- `createApiKey({ appId, name, createdByType, createdById?, expiresAt? })`
  returns `{ apiKey, secret }`. Only the hash and prefix are stored.
- `listApiKeys(appId)` excludes revoked keys.
- `revokeApiKey(appId, apiKeyId)` returns `false` if no active key matched. In
  the same transaction, it deletes every signature whose `api_key_id` is that
  key (§7.1).
- `getApiKeyBySecret(secret)`:
    - joins `apps`;
    - requires `apps.deleted = false`, `revoked_at IS NULL` and the key not to be
      expired;
    - returns the key row together with its app.
- `touchApiKeyLastUsed(id)` is fire-and-forget. It is throttled by
  `WHERE last_used_at IS NULL OR last_used_at < now() - interval '5 minutes'`.

### 6.3 `apps/api/src/db/repository.ts`

- The current key functions become app functions: `createApp`, `listApps`,
  `getAppByPublicId(userId, appId)`, `renameApp`, `setDefaultApp` and
  `softDeleteApp`.
- `createApp` creates only the app. The dashboard's **New app** route then
  creates its first key and returns the secret once. This is not one
  transaction: if creating the key fails, the app exists without a key, and
  the user can create one in settings.
- `softDeleteApp`, in one transaction:
    - marks the app deleted;
    - revokes all of its keys;
    - deletes all of its signatures.
- `ensureProfile` creates the default app **without a key**. A key created
  automatically would be a live credential whose secret nobody ever sees. Users
  create keys from the dashboard when they need one. OAuth and MCP don't need a
  key. The one exception is the operator-supplied bootstrap key (§6.4).

### 6.4 Bootstrap key (`apps/api/src/bootstrap.ts`)

Bundled installs need a key that both MediaLit and the product know before
either starts. Today MediaLit logs a generated key at first boot
(`apps/api/src/index.ts`, `createAdminUser`), and someone has to copy it into
the product's environment. That breaks in a single compose file. It also
conflicts with hashing (the secret exists only at creation) and with the
platform rule "never log raw keys". Instead, **the operator supplies the key**.

**Configuration.** Set `MEDIALIT_BOOTSTRAP_API_KEY` to the key value.

- **Format:** at least 43 characters from `[A-Za-z0-9_-]`. The docs and
  `.env.example` generate it with `ml_live_$(openssl rand -hex 32)`, which keeps
  the `ml_live_` prefix for secret scanners.
- **Validation:** a value outside the format stops startup with a non-zero exit.
  MediaLit can't check randomness, only shape.
- **`EMAIL`** is required whenever the bootstrap key is set, because the key
  belongs to the admin's default app.

**Startup.** `bootstrap()` replaces `createAdminUser()`. It runs after
migrations and before `app.listen`. Any failure is fatal: it logs and exits
non-zero, and the container's restart policy retries.

1. If `EMAIL` is set, make sure the admin user, its profile and its default app
   exist (`ensureProfile`, which creates no key).
2. If `MEDIALIT_BOOTSTRAP_API_KEY` is unset, stop here. Nothing secret is
   logged, and keys are created from the dashboard.
3. Hash the value, then in one transaction:

    - **Already the active bootstrap key** (the hash matches an active
      `bootstrap` key): do nothing. Restarts are no-ops. The key stays on the
      app it was created on, so changing the admin's default app later doesn't
      move or break it.
    - **A revoked `bootstrap` key** has this hash (the operator rolled back to an
      old value): un-revoke it, and revoke any other active `bootstrap` keys.
    - **A non-bootstrap key** has this hash (someone pasted a dashboard key into
      the variable): exit with an error. One key can't be owned by both the
      dashboard and configuration.
    - **Otherwise:**

        - revoke every other active `bootstrap` key, deleting their signatures
          (§7.1);
        - insert a key named `Bootstrap (MEDIALIT_BOOTSTRAP_API_KEY)` with
          `created_by_type = 'bootstrap'` on the admin's default app. The insert
          does nothing on a hash conflict, so replicas starting together don't
          fail.

        It skips the 10-key limit but counts toward it (§13).

**Rotation.** Change the value in `.env` and restart both MediaLit and the
product. The old key is revoked as soon as MediaLit starts with the new value.

**Removing the variable** leaves the existing bootstrap key active. Removing
config should not break a running product. Once removed, the key can be revoked
from the dashboard like any other.

**Managed while configured.** While a key's hash equals the current
`MEDIALIT_BOOTSTRAP_API_KEY`:

- `DELETE /api/apps/:appId/keys/:keyId` returns
  **409 `managed_by_configuration`**;
- the dashboard shows a **Managed by configuration** badge instead of
  **Revoke**.

Otherwise the next restart would silently revive a key the user just revoked.

**Readiness.** The API listens only after `bootstrap()` succeeds. A product that
waits for `medialit` to become `service_healthy` (via the existing `/health`
route) therefore always starts with a working key.

**Bundled compose pattern**, for SendLit, FrontLit and CourseLit. One variable
in the product's `.env` feeds both services:

```yaml
# .env:  MEDIALIT_APIKEY=ml_live_<output of: openssl rand -hex 32>
services:
    medialit-migrate: # same as MediaLit's own `init` service
        image: codelit/medialit
        restart: "no"
        command: ["bun", "apps/api/src/db/migrate.ts"]
    medialit:
        image: codelit/medialit
        depends_on:
            medialit-migrate: { condition: service_completed_successfully }
        environment:
            EMAIL: ${ADMIN_EMAIL}
            MEDIALIT_BOOTSTRAP_API_KEY: ${MEDIALIT_APIKEY:?MEDIALIT_APIKEY is required}
        healthcheck:
            test: ["CMD", "wget", "-qO-", "http://localhost:8000/health"]
    frontlit:
        environment:
            MEDIALIT_APIKEY: ${MEDIALIT_APIKEY}
            MEDIALIT_SERVER: http://medialit:8000
        depends_on:
            medialit: { condition: service_healthy }
```

**Hosted** (medialit.cloud) never sets the variable.

## 7. API: authentication

Transport:

- **Header only.** API keys are read only from the `x-medialit-apikey` header.
  The legacy body `apikey` field is **removed on every route**, JSON and
  multipart alike:

    - `resolveAuth` drops its `bodyApiKey` input, along with the
      header-versus-body ambiguity rule.
    - `auth/middleware.ts` stops reading `req.body?.apikey`.
    - The swagger spec and docs drop the field.

    A key in the body is ignored. Such a request is treated as having no
    credential and gets a 401 naming the header to use.

- **Ambiguity.** A request carrying both Bearer and `x-medialit-apikey` is
  still `ambiguous`.
- **Bearer stays OAuth-only.**

Removing the body field also lets uploads authenticate before their body is
read (§7.2).

- **`auth/resolve-auth.ts`.** The API-key result becomes
  `{ kind: "apikey", user, userId, appId, apiKeyId }`:

    - `appId` is the internal `apps.id`.
    - `apiKeyId` is the internal `api_keys.id`.

    The resolver calls `touchApiKeyLastUsed` itself. `getEffectiveOAuthApiKey`
    becomes `getEffectiveOAuthApp`, which maps the token's `app_id` claim (the
    public ID) to the internal ID.

- **`auth/middleware.ts`.** `req.apikey` is replaced by:

    - `req.appId`, for every kind of authentication;
    - `req.apiKeyId`, for API-key authentication only. It is server-side only,
      and its sole consumer is signature creation (§7.1), over REST or MCP.

    No secret is attached to the request.

- **`tus/tus-server.ts`.** Remove the TUS-only resolver and use the shared
  `getApiKeyBySecret`. This closes the deleted-key hole on uploads.
- **`signature/*`.** See §7.1.
- **`mcp/auth-context.ts`.** `apikey: string` becomes `appId`, plus
  `apiKeyId?: string` for API-key callers. The `create_upload_signature` tool
  mints signatures, so it needs it for §7.1. (`upload_media` uploads
  directly and mints none.) Update every tool: `media`,
  `settings`, `signature`, `upload` and `whoami`. `whoami`
  reports the public `apps.app_id`, as it does today. The `clientId` stays
  `"apikey"`.
- **Downstream code.** Rename `apikey` to `appId`, which now holds the internal
  ID, in:
    - `media/{handlers,service,queries}.ts`
    - `media-settings/*`
    - `tus/finalize.ts`
    - `dashboard/routes.ts`, where `owned.key.key` becomes `owned.app.id` and
      media summaries group and join by `app_id`

Billing and storage limits are per user and don't change.

### 7.1 Signatures follow their key

A signature is a one-upload credential, valid for 24 hours by default
(`SIGNATURE_VALIDITY_MINUTES`). Without a link back to its key, someone holding
a leaked key could mint thousands of signatures before the key is revoked. They
could then keep uploading for up to a day afterwards. SendLit and FrontLit have
no credentials derived from a key, so this is specific to MediaLit.

- **Creating.** `generateSignature` stores `app_id` and, for API-key callers,
  `api_key_id`: `req.apiKeyId` over REST, the tool context's `apiKeyId` over
  MCP. Signatures minted through OAuth or the dashboard
  leave it null.
- **Revoking a key.** Deleting the key's signatures happens in the same
  transaction as the revocation (§6.2).
- **Deleting an app.** All of the app's signatures are deleted (§6.3).
- **Using a signature.** The lookup joins `apps` and requires
  `apps.deleted = false`, so a signature is rejected after its app is deleted
  even if the deletes above failed. It also joins `api_keys` when `api_key_id`
  is set, and requires `revoked_at IS NULL`.
- **Request context.** `signatureMiddleware` and the TUS signature path set
  `req.appId` from the signature row.

### 7.2 Uploads authenticate before the body is read

`POST /media/create` becomes this middleware chain:

1. `cors()` and `authenticatedApiLimiter`, unchanged.
2. **`authenticateUpload`.** Reads credentials from the request headers and
   query string only:

    - a signature (`?signature=` or the `x-medialit-signature` header);
    - otherwise, the `x-medialit-apikey` header or `Authorization: Bearer`.

    It runs the shared resolver and signature lookup, then applies
    `requireScope(DATA_WRITE_SCOPE)` to non-signature callers. A request with no
    credential in its headers or query string gets **401 before any body
    bytes are read**. The error tells the caller to send `x-medialit-apikey`.

3. **`preflightUploadSize`.** When `Content-Length` is present, it rejects the
   request before parsing if the length:

    - exceeds the caller's plan upload limit (`maxUploadFor`): **400**,
      `FILE_SIZE_EXCEEDED`;
    - exceeds the caller's remaining storage (`hasEnoughStorage`): **403**,
      `NOT_ENOUGH_STORAGE`.

    `Content-Length` includes multipart overhead, so allow a small margin
    (64 KB).

4. **`fileUpload`**, built per request, with `limits.fileSize` set to the
   caller's plan limit, never above `MAX_UPLOAD_SIZE_SUBSCRIBED` (which still
   caps self-hosted installs whose plan is unlimited). Chunked
   uploads without a `Content-Length` are still capped here.
5. `storage` (the existing `storageValidation`, which re-checks the real file
   size) and `uploadMedia`, unchanged.

Consequences:

- **No body credentials.** Since the body field is gone (§7), every upload
  credential is available before the body is read. There is no fallback path
  that has to parse an upload to find its key.
- **TUS.** No change: `onIncomingRequest` already authenticates every TUS
  request before any data is stored.

### 7.3 Inactive accounts lose API access

`profiles.active = false` blocks every **API** credential:

- **API keys.** `getApiKeyBySecret` also returns `profiles.active` for the
  key's owner.
- **OAuth.** `resolveAuth` loads the profile for OAuth callers.
- **Inactive result.** For either kind, an inactive owner gives a new result,
  `{ status: "forbidden", error: "account_inactive" }`, sent as **403**.
  It is a 403 rather than a 401 so integrations can tell "your key is wrong"
  apart from "your account is disabled".
- **Signatures.** The signature lookup joins `profiles` and rejects inactive
  owners with the same 403. This covers REST uploads and the TUS signature
  path.
- **TUS and MCP.** Both use the shared resolver, so they inherit the check.

**Dashboard sessions stay usable**, so the owner can still sign in, see the
account state (`/api/account` already returns `active`), manage billing and
delete media. Dashboard signatures are blocked by the signature check, so
deactivated accounts can't upload from the dashboard either.

Nothing in the product sets `active = false` today. Operators set it in the
database, and the Mongo importer carries it over. Building an admin control is
out of scope.

## 8. API: management routes

The routes live in `apps/api/src/dashboard/routes.ts` and require a session. The
caller must own the app. `:appId` is always the public `apps.app_id`.

| Method   | Path                           | Body                   | Response                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/apps/:appId/keys`        | —                      | `200 { items: [{ keyId, name, keyPrefix, createdAt, lastUsedAt, expiresAt, managedByConfiguration }], limit: 10 }`, active keys only. `limit` lets the dashboard disable **Create key** without hard-coding the cap. `managedByConfiguration` is true for the key whose hash equals the current `MEDIALIT_BOOTSTRAP_API_KEY` (§6.4) |
| `POST`   | `/api/apps/:appId/keys`        | `{ name, expiresAt? }` | `201` with the item plus `key` (shown once); `409 { error: "api_key_limit_reached" }` when the app already has 10 active keys                                                                                                                                                                                                       |
| `DELETE` | `/api/apps/:appId/keys/:keyId` | —                      | `204`; `404` if there is no active key with that ID; `409 { error: "managed_by_configuration" }` for the currently configured bootstrap key (§6.4)                                                                                                                                                                                  |

`keyId` in responses is the public `api_keys.api_key_id`.

Changes to existing routes:

- `/api/apps/:keyId/*` becomes `/api/apps/:appId/*`. The values are the same,
  so this is a rename only.
- `POST /api/apps` returns `{ appId, name, default, key, apiKey }`, where
  `key` is the first key's secret, shown once, and `apiKey` its list entry.
- `GET /api/apps/:appId` no longer returns a secret.
- `DELETE /api/apps/:appId` soft-deletes the app and revokes its keys.
- Create and revoke write a `log.info` audit line with the app, key ID, prefix
  and user, but never the secret.

MCP: no key-management tools in this change. If they're added later, deny
API-key callers, as FrontLit does.

## 9. Web app

- **Route.** Rename `app/app/[keyid]` to `app/app/[appId]`. The URL values are
  unchanged.
- **Settings page.** Replace `ApiKeyControl` with an **API keys** section:
    - A table with name, prefix, created and last used.
    - A **Create key** dialog with two steps: first the name, then "Store this key
      now. It won't be shown again", with a read-only field and a copy button.
    - Revoke behind a confirmation dialog.
- **Delete.** `api-key-control.tsx` and the unused `copy-apikey-button.tsx`.
- **`app/actions.ts`.** `getApikeyUsingKeyId` becomes `getApp(appId)`, which
  returns no secret. Add `listKeys`, `createKey` and `revokeKey`. Rename `keyId`
  to `appId` throughout.
- **`components/new-app-button.tsx`.** After creating an app, show its first key
  using the same "store this key now" step, then navigate to the app.

## 10. Other changes

- **Shared models (`packages/models/src/api-key.ts`).** Split `Apikey` into
  `App` and `ApiKey`, and drop `restriction`, `httpReferrers` and `ipAddresses`.
- **SDK types (`packages/medialit/src/types.ts`).** Drop `Media.apikey`. The SDK,
  CLI and uploader need no other changes, because they send the same header.
- **Admin bootstrap (`apps/api/src/index.ts`).** Replace `createAdminUser()`
  with `bootstrap()` (§6.4), and remove the `"Admin user created"` log line that
  printed the key.
- **Integration stack (`packages/integration-tests/scripts/run-with-local-stack.sh`).**
  Generate `ml_live_$(openssl rand -hex 32)`, then pass it to the API as
  `MEDIALIT_BOOTSTRAP_API_KEY` and to the suites as `MEDIALIT_APIKEY`. This
  replaces scraping the key from the log.
- **MediaLit's own self-hosting files.**
    - `docker-compose.yml` passes `MEDIALIT_BOOTSTRAP_API_KEY=${MEDIALIT_BOOTSTRAP_API_KEY:-}`.
    - `.env.example` documents it, with the generation command.
    - Standalone installs can leave it empty and create keys in the dashboard.
- **Bundled products.** Follow-up PRs in SendLit, FrontLit and CourseLit adopt
  the compose pattern from §6.4 when they bundle MediaLit.
- **`packages/scripts/src/import-mongo.ts`.** Hash imported secrets into
  `api_keys` as `legacy` keys. Map `doc.apikey` to `app_id` through an in-memory
  map from secret to app.
- **Docs.**
    - Add `apps/docs/content/docs/api-keys.mdx`.
    - Update `concepts.mdx`, `dashboard.mdx`, `self-hosting.mdx` and
      `quick-start.mdx`. `self-hosting.mdx` gains a "Bootstrap API key" section:
      format, generation, rotation, and the bundled-compose pattern.
    - Add an upgrade note covering four points:
        - **Migrations run automatically with Docker Compose.** The `init` service
          runs `apps/api/src/db/migrate.ts` before the API starts, so upgrading is
          `docker compose pull && docker compose up -d`. Deployments that run the
          image without Compose must run that command themselves before starting
          the new version. `self-hosting.mdx` doesn't mention migrations today, so
          add this there too.
        - Existing keys keep working but can't be displayed again. Take a database
          backup before upgrading: `0008` drops the plaintext column and can't be
          rolled back. If `0008` fails, for example on a media row whose key no
          longer exists, the transaction rolls back and the API doesn't start.
        - The body `apikey` field is no longer accepted; send the
          `x-medialit-apikey` header.
        - Deactivated accounts now get 403 from the API.

## 11. Tests

| Area                                                        | What to test                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apikey/secret.test.ts`                                     | Prefix, length and entropy, hash, display prefix                                                                                                                                                                                                                                                                                                                                          |
| `apikey/queries.test.ts` (PGlite)                           | Only the hash is stored; lookup by secret works; revoked keys, expired keys and keys of deleted apps all return `null`; `last_used_at` is written and throttled                                                                                                                                                                                                                           |
| Migration test (PGlite)                                     | The migration applies cleanly after `0000`–`0007`, with no index or constraint name collisions; a legacy plaintext secret still authenticates after the backfill; media, settings, signatures and TUS uploads map to the right `app_id`; an unmapped row fails the migration                                                                                                              |
| `repository.test.ts`                                        | Update the plaintext and deleted-key assertions; `softDeleteApp` revokes keys and deletes signatures; `ensureProfile` creates an app with no keys                                                                                                                                                                                                                                         |
| `media/routes` upload tests                                 | No credential in headers or query: 401 and no temp file written; a multipart `apikey` field alone: 401; `Content-Length` over the plan limit: 400 before parsing; over the remaining storage: 403 before parsing; header key and signature uploads still succeed                                                                                                                          |
| `bootstrap.test.ts` (PGlite)                                | Unset variable: admin app exists with no keys and nothing secret is logged; set: the key authenticates; restarting with the same value changes nothing; a new value revokes the old key and deletes its signatures; reverting to an old value un-revokes that key; a malformed value or a dashboard key's value exits non-zero; removing the variable leaves the key active and revocable |
| Bootstrap revoke guard                                      | Revoking the configured bootstrap key gets 409 `managed_by_configuration`; after the variable is removed, it revokes normally                                                                                                                                                                                                                                                             |
| Inactive-account tests                                      | An inactive owner gets 403 `account_inactive` via API key, OAuth bearer, signature (REST and TUS) and MCP; dashboard session routes still work                                                                                                                                                                                                                                            |
| Signature tests                                             | A key-minted signature records `api_key_id`, over both REST and the MCP `signature` and `upload` tools; revoking the key deletes its signatures; a signature is rejected after its key is revoked or its app deleted; OAuth- and dashboard-minted signatures survive revoking a key                                                                                                       |
| `auth/__tests__/resolve-auth.test.ts`, `middleware.test.ts` | A body `apikey` alone gets 401, and the header-versus-body tests are removed; `req.appId` is set; `req.apiKeyId` is set only for API-key auth; no secret appears on the request or the auth result; OAuth maps the `app_id` claim to the internal ID                                                                                                                                      |
| `__tests__/tus/tus-server.test.ts`                          | A revoked key and a deleted app's key are both rejected                                                                                                                                                                                                                                                                                                                                   |
| `dashboard/routes.test.ts`                                  | Key CRUD; another user's `appId` gets 404; the secret appears only in create responses; deleting an app revokes its keys; the 11th active key gets 409 `api_key_limit_reached`, and revoking one frees a slot                                                                                                                                                                             |
| MCP tool tests                                              | Fixtures use `appId`; `whoami` returns the public app ID and no secret                                                                                                                                                                                                                                                                                                                    |
| Integration suite                                           | Passes unchanged against the local stack                                                                                                                                                                                                                                                                                                                                                  |

## 12. Delivery

The schema change and the switch from `apikey` to `appId` in the auth context
can't be split: the columns change underneath every query. They ship as one PR,
with one commit per section: §5 and §6, then §7, then §8.

The web UI (§9) and docs (§10) can be a second PR, but must ship in the same
release, because `GET /api/apps/:appId` stops returning the key.

## 13. Decisions

None are open.

### Resolved

- **Hashing (2026-10-17): plain SHA-256, not HMAC with a pepper.**

    - **Consistency.** SendLit and FrontLit hash API keys with plain SHA-256. The
      org uses HMAC only where the input can be guessed: webhook signatures, and
      SendLit's suppression-list fingerprint over email addresses.
    - **No practical protection lost.** A pepper only helps when someone has the
      database but not the server's environment. New keys carry 256 bits of
      entropy, and legacy keys about 126 bits, so brute-forcing them from their
      hashes is infeasible either way.
    - **Bundled installs.** Without a pepper, each product's compose file needs no
      extra permanent secret, and the bootstrap key (§6.4) can be any random
      value.
    - **The conflict.** The platform's decision record 0005, and its
      `reference-product` and `saas-product` template, call for HMAC with a pepper.
      Reconciling that is tracked in codelitdev/platform#9: either accept SHA-256 for
      random secrets of at least 256 bits, or migrate all products together.

- **The body `apikey` field (2026-10-17): removed on every route, with no
  opt-in flag.** MediaLit has no external users yet, and every internal
  consumer (CourseLit, FrontLit, SendLit) already sends the header. Keeping the
  field on uploads would have left the pre-authentication disk-write gap open.
  Keeping it on JSON routes would only preserve a second credential path and
  its ambiguity rule.

- **Drop the plaintext column in the same migration (2026-10-17): yes.**
  `0008_api_keys.sql` drops `apps.key` once the tenant tables are re-keyed, so
  no plaintext secret survives the upgrade. There is no rollback window. A
  database backup taken before migrating is the recovery path, and the upgrade
  note (§10) requires it. With no external users, a one-release rollback window
  would only keep plaintext keys around longer.
- **Active keys per app (2026-10-17): at most 10.**
    - `createApiKey` counts the app's active keys (not revoked, not expired)
      inside the insert transaction, locking the app row with `FOR UPDATE` so two
      concurrent creates can't both pass the check.
    - Over the limit, `POST /api/apps/:appId/keys` returns 409
      `api_key_limit_reached`, and the dashboard disables **Create key** with a
      hint to revoke an unused key.
    - Keys created by the system (the bootstrap key and the first key of a new
      app) skip the check but still count toward the 10.
- **Key expiry (2026-10-17): in the API, not in the UI.**
    - `api_keys.expires_at` is stored, and lookups treat expired keys as
      invalid.
    - `POST /api/apps/:appId/keys` accepts an optional `expiresAt`, which must be
      in the future; anything else gets 400.
    - The dashboard's create dialog doesn't offer it yet, matching SendLit.
      Adding a picker later needs no schema or API change.
