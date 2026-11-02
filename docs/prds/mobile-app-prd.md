# MediaLit Mobile App

**Status:** Draft. Phase 1 is partly built: §5.2 to §5.4 are implemented (asset
IDs, capture time and dimensions, the timeline and asset lookup endpoints). §5.1,
§5.5 and §5.6 are not started.
**Author:** Rajat Saxena
**Date:** 2026-11-02

## 1. Objective

Ship an official iOS and Android app for MediaLit Cloud (`api.medialit.cloud`)
that lets people:

- Browse and view their files on the go.
- Upload files by hand.
- Back up their camera roll automatically, the way Google Photos does.

The app is a thin client. The API owns product behavior, as it does for the web
dashboard. Everything the app needs that the API cannot do today is added to
the API first, and every API change is additive: MediaLit is the shared file
backend for CourseLit, SendLit and FrontLit, and none of them may notice.

## 2. Decisions

| #   | Decision                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 is browse plus manual upload. Automatic camera-roll backup follows in a later phase (§8).                                                                                    |
| 2   | iOS and Android from the start, built with Expo (React Native, TypeScript).                                                                                                     |
| 3   | Camera photos are private by default. Their thumbnails stay off the public bucket, behind an opt-in per-app setting so the public thumbnails the CMS products use keep working. |
| 4   | The phone syncs into a dedicated app named **Camera Roll**, created if the user does not have one.                                                                              |
| 5   | The app targets `api.medialit.cloud` only. There is no server URL setting and no self-hosting support. Self-hosted instances keep using the web dashboard, API and CLI.         |

## 3. Non-goals for v1

- Albums, sharing links, search, face or place recognition.
- "Free up space" (deleting local copies after backup).
- Cross-device change feeds and delete tombstones (§9).
- Offline editing, in-app photo editing.
- Tablet-specific layouts.

## 4. Current state

What the app can build on:

- **Login.** The API is an OAuth server (Better Auth, authorization code with
  PKCE). Scopes `data:read`, `data:write` and `offline_access` exist, the hosted
  login is email OTP, and the login page works in an in-app browser. A token is
  bound to one app through the `app_id` claim, chosen at consent
  (`auth/oauth-app-selection.ts`).
- **Bearer auth on the data routes.** `/media/get`, `/media/get/:mediaId`,
  `/media/seal/:mediaId`, `/media/delete/:mediaId`, `/media/create` and the TUS
  endpoint `/media/create/resumable` all accept `Authorization: Bearer`.
- **Resumable uploads.** TUS takes `fileName`, `mimeType`, `access`, `caption`
  and `group` as metadata. An upload stays `temp` until `POST /media/seal/:id`,
  which also checks quota.

What is missing for a camera roll:

1. **No capture time.** `media` has only `createdAt`, the upload time. A
   backfilled library would sort in upload order.
2. **No idempotency.** Nothing identifies a local asset on the server. A crash
   between the TUS finish and the seal, or a reinstall, creates duplicates.
3. **No suitable listing.** Bearer `/media/get` returns a bare array paged by
   `page` and `limit` (offsets shift while uploads run). `search`, `kind` and
   `sort` exist in `mediaService.getPage` but only the cookie-session dashboard
   routes expose them.
4. **No layout metadata.** Width, height and video duration are not stored, so a
   grid cannot reserve space before images load.
5. **Thumbnails do not fit photos.**
    - Thumbnails are generated for JPEG, PNG, WebP and video only
      (`config/constants.ts`). HEIC, the iPhone default, gets none.
    - `bin/generate-thumbnail.sh` center-crops every image to 16:9, so a
      portrait photo becomes a narrow strip.
6. **Private thumbnails are public.** On seal, thumbnails of private files are
   copied to the public bucket (`media/service.ts`, `sealMedia`). The URLs are
   unguessable but need no authentication.

## 5. API changes

All changes are additive, documented with the swagger annotations, and covered
by tests. Anything that touches an MCP tool also updates
`packages/integration-tests/src/mcp.ts`, as `apps/api/AGENTS.md` requires.

### 5.1 Camera Roll app, provisioned at authorization

The mobile app is a first-party public client with a fixed `client_id` and
registered redirect URIs, not a dynamically registered one. When a user
authorizes that client:

1. Find the user's non-deleted app named `Camera Roll`. If there is none,
   create it with its media settings (§5.5) turned on.
2. Select it as the token's app and skip the app picker.

Every other client keeps today's picker. The API owns this, so the app never
creates apps itself (app creation is cookie-session only today).

Edge cases:

- A user who already made an app called `Camera Roll` by hand gets that app. The
  unique index on `(user_id, name)` makes a second one impossible anyway.
- If the user deletes the app, the next request gets `invalid_token`
  (`resolveAuth` already does this). The app re-authorizes and the API
  recreates it.

To verify during implementation: the post-login hook only receives the user and
session, so the client ID may have to come from the `oauth_query` the picker
page already reads. Also verify how the OAuth provider registers a trusted
public client, and whether billing caps the number of apps per account.

### 5.2 Asset identity and idempotency

Add `media.asset_id` (nullable text) with a unique index on
`(app_id, asset_id) WHERE asset_id IS NOT NULL`. Accept `assetId` on
`POST /media/create` and as TUS metadata.

- Creating an upload whose `assetId` already exists in the app is rejected with
  `409 { error: "asset_exists", mediaId, sealed }`. A client that crashed after
  the upload then only needs to seal.
- `POST /media/get/assets` takes `{ assetIds: string[] }` (up to 200) and
  returns `[{ assetId, mediaId, sealed }]` for the ones that exist. The client
  calls it before uploading a batch.
- Expired temp uploads are already deleted by `cleanupExpiredTempUploads`, which
  frees their `assetId` for a retry.

The server treats `assetId` as an opaque string. The client builds it (§7.4).

Optional: a `seal` flag (REST field and TUS metadata) that seals on finalize for
authenticated uploads. It is needed only if the background-upload spike (§8,
phase 4) shows that no JS runs after a background upload completes.

### 5.3 Capture time and layout metadata

Add nullable columns `taken_at`, `width`, `height` and `duration_ms`.

- `takenAt` comes from the client (asset creation time) as an ISO string in the
  upload metadata or form field. The server rejects values in the future by more
  than a day and treats it as untrusted for authorization, only for ordering.
- `width`, `height` and `duration_ms` are probed on the server during upload
  processing with `ffprobe`, which `generate-thumbnail.sh` already uses.
- Existing rows keep `NULL` and sort by `created_at`.

### 5.4 Timeline endpoint

`GET /media/timeline?limit=&cursor=&kind=&group=`, with Bearer or API key and
the `data:read` scope.

```json
{
    "items": [
        {
            "mediaId": "…",
            "originalFileName": "IMG_0001.HEIC",
            "mimeType": "image/heic",
            "size": 2481234,
            "access": "private",
            "thumbnail": "https://…",
            "takenAt": "2026-10-30T14:02:11.000Z", // null if the uploader sent none
            "createdAt": "2026-11-02T09:00:00.000Z",
            "width": 4032,
            "height": 3024,
            "durationMs": null,
            "assetId": "…"
        }
    ],
    "nextCursor": "opaque-or-null"
}
```

- Sealed items only, sorted by `COALESCE(taken_at, created_at) DESC, id DESC`.
- Keyset pagination. The cursor is an opaque encoding of the last item's sort
  key and id, so uploads in progress never shift pages. `limit` is 1 to 200.
- Needs an index on `(app_id, temp, COALESCE(taken_at, created_at) DESC, id DESC)`.
- The existing `POST /media/get` is untouched. Its response is a bare array and
  cannot carry a cursor without breaking callers.
- The full-size `file` URL stays on `POST /media/get/:mediaId`. The app fetches
  it when the viewer opens.

### 5.5 Private thumbnails and thumbnail shape: opt-in settings

Two new per-app `media_settings` fields, both defaulting to the current
behavior so nothing changes for existing apps:

| Setting             | Default | Camera Roll | Effect                                                                                                 |
| ------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `privateThumbnails` | `false` | `true`      | On seal, thumbnails of **private** files stay in the private bucket and are returned as signed URLs.   |
| `thumbnailFit`      | `crop`  | `contain`   | `crop` keeps today's 16:9 center crop. `contain` keeps the aspect ratio with a longest edge of 480 px. |

Details:

- Public files always get public thumbnails, whatever the setting.
- Record where each thumbnail lives in a new `media.thumbnail_private` boolean,
  set at seal. `removeStoredFiles` and `getMediaResponse` read it instead of
  inferring the bucket from `temp`, so flipping the setting later cannot orphan
  or mis-delete files. Flipping it does not migrate existing thumbnails.
- `getPage` (the dashboard and `/media/get`) must sign private thumbnail URLs
  for rows with `thumbnail_private`. Signing is local computation, not a network
  call.
- Both settings are exposed through `/settings/media` and the MCP settings tool,
  with integration-test coverage.
- Signed URLs expire, so the app caches images by `mediaId`, never by URL.

### 5.6 HEIC and HEIF thumbnails

Extend thumbnail generation to `image/heic` and `image/heif`.

- Verify whether the `ffmpeg` in the API image decodes HEIC. If it does not,
  add a decoder (for example `libheif` tools) to the Dockerfile and convert to a
  JPEG intermediate before the thumbnail step.
- The original HEIC is stored untouched. Only the thumbnail is converted.
- Check other camera formats (DNG, Live Photo video, 10-bit HEVC) as part of the
  same pass.

### 5.7 Compatibility and tests

- Unit tests for the new fields, the 409 path, cursor paging at ties, and the
  setting defaults.
- Integration tests in `packages/integration-tests` for the new REST routes,
  and MCP parity if any tool changes.
- The existing CMS upload flow (signature, seal, public thumbnail) is covered by
  tests that must keep passing unchanged.

## 6. Mobile app architecture

- **Location:** `apps/mobile` in this monorepo, private, not published.
- **Stack:** Expo with development builds (not Expo Go), TypeScript, Expo
  Router, TanStack Query for server state.
- **Native modules:** `expo-auth-session`, `expo-secure-store`,
  `expo-media-library`, `expo-image` (disk cache), `expo-file-system`,
  `expo-background-task` / `expo-task-manager`, `tus-js-client`.
- **API access:** a small typed client generated or written against
  `/openapi.json`. No product logic lives in the app.
- **Builds:** EAS Build and EAS Submit. Needs an Apple Developer account, a
  Google Play account, a privacy policy URL, and permission usage strings
  (photo library read, and write if we save downloads).

Monorepo cautions to resolve in phase 2:

- Bun's workspace linker versus Metro's resolution. If Metro cannot follow the
  default install layout, set a hoisted linker for the workspace or install
  `apps/mobile` separately. Do not change install behavior for the other
  packages without checking CI.
- The root `overrides` pin versions of packages such as `next`, `postcss` and
  `babel`. Confirm they do not conflict with React Native's tree.
- The root ESLint config targets Next.js. Give `apps/mobile` its own scope.

## 7. Mobile behavior

### 7.1 Auth

Authorization code with PKCE through an in-app browser against the hosted login
(§5.1), requesting `openid offline_access data:read data:write`. Tokens go in
secure storage. On `401 invalid_token` the app refreshes once, and if that
fails it signs the user out and re-authorizes.

### 7.2 Screens (v1)

- **Sign in.** One button, then the hosted page.
- **Library.** Square-tile grid grouped by day from `takenAt`, infinite scroll
  on the timeline cursor, pull to refresh, loading, empty and error states.
- **Viewer.** Pinch zoom, swipe between items, video playback, details sheet
  (name, size, date, dimensions), delete with confirmation, share, save to
  device.
- **Upload.** Pick from the device library, queue with per-file progress, retry
  and cancel.
- **Account.** Storage used versus plan limit (`POST /media/get/size`), sign
  out.

### 7.3 Upload pipeline

1. Build the `assetId` and call `POST /media/get/assets` for the batch.
2. For missing assets, start a TUS upload with `access: private`, `assetId`,
   `takenAt`, `fileName` and `mimeType`.
3. On finish, `POST /media/seal/:id`. A `403` for quota shows an "out of
   storage" state and pauses the queue instead of retrying.
4. Persist the queue in local storage so it survives restarts, and resume TUS
   uploads from the server offset.

### 7.4 Asset ID

The server does not interpret it. The local media library ID is not stable
across reinstalls or devices, so the client derives it from file facts:
`sha1(takenAtMs | originalFileName | size)`. This is cheap (no file read) and
good enough to avoid duplicates after a reinstall. An edited photo changes
size and uploads again, which matches what users expect. Revisit in phase 3 if
real collisions show up.

## 8. Phases

1. **API groundwork** (§5). Nothing ships to users. Done when the new routes,
   settings and tests are merged and the CMS products' behavior is unchanged.
2. **App shell.** Sign in, Camera Roll app provisioning, library grid, viewer,
   delete, storage meter. Internal TestFlight and Play internal track.
3. **Manual upload.** Picker, TUS queue, seal, quota handling, `assetId`
   dedupe. Public beta.
4. **Automatic backup.** Permission flow, backup on and off, Wi-Fi only,
   charging only, folder selection, status screen, resume. **Spike first:**
   whether `expo-file-system` background uploads (iOS background `URLSession`,
   Android WorkManager) can carry an upload with no JS running. If so, use
   `POST /media/create` with `seal` in the background and TUS in the foreground
   for large videos. If not, rely on foreground sync plus opportunistic
   background tasks. iOS gives no guaranteed background runs, and the UI must
   say so honestly ("Backup paused, open the app to continue").
5. **Later.** Free up space, search, albums, sharing, change feed.

## 9. Risks and open questions

- **Deletes and re-upload.** With no tombstones, a photo deleted in the cloud
  looks "missing" after a reinstall and uploads again. The device keeps a local
  ledger of uploaded asset IDs to avoid this within an install. A server-side
  tombstone (or soft delete) is a phase 5 item. Decide whether v1 can live with
  it.
- **Storage plans.** A camera roll fills quota quickly. Check the free-plan
  limit and what the app shows when backup stops. This is a pricing question,
  not only an engineering one.
- **Store review.** Apple reviews photo-library access closely. The usage
  strings and privacy policy need to describe backup plainly.
- **Large videos.** Check API upload size limits (`preflightUploadSize`) and
  temp disk on the API host for multi-GB videos.
- **Live Photos and bursts.** v1 treats each as the still image only.
- **Signed URL lifetime.** Not yet checked. It affects how long the viewer can
  stay open on a video.
