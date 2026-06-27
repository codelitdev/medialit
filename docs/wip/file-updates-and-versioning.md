# Product Requirements Document (PRD)

**Title:**
Vendor-Agnostic File Updates and Versioning

**Product:**
MediaLit - Cloud Digital Asset Management Service

**Author:**
Rajat Saxena

**Version:**
WIP - June 2026

---

## 1. Overview

MediaLit currently supports upload, temporary storage, sealing, retrieval, and deletion for media files. This PRD defines a vendor-agnostic architecture for updating an existing media file while preserving version history.

The design must not depend on AWS-specific S3 features such as native S3 object versioning, S3 lifecycle rules, object tags as correctness primitives, CloudFront invalidation, or AWS-specific version IDs. MediaLit should own version semantics in the application and database layer so the same behavior works across S3-compatible providers such as AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, Wasabi, and MinIO.

---

## 2. Objectives

1. Allow an existing `mediaId` to receive a replacement file without changing the public media identity.
2. Preserve previous versions for rollback, auditability, and optional retention.
3. Keep versioning behavior independent of storage-provider-specific object versioning.
4. Avoid object overwrites by storing each version at an immutable object key.
5. Keep the database as the source of truth for the current version.
6. Support public and private media using the existing dual-bucket access model.
7. Support safe concurrent updates using optimistic concurrency.
8. Provide a clear cleanup path for old, stale temporary, and tombstoned versions.
9. Count all retained versions against user storage quota.
10. Support resumable uploads for replacement versions.
11. Allow clients to attach version names and changelog notes.

---

## 3. Non-Goals

1. Use native AWS S3 object versioning.
2. Require CDN cache invalidation for file updates.
3. Require provider-specific object lifecycle policies.
4. Guarantee atomic object moves or renames in storage.
5. Add full branching or collaborative editing semantics.
6. Change the meaning of `mediaId` for existing API consumers.

---

## 4. Key Architecture Decision

MediaLit will use application-managed immutable versions.

`mediaId` remains the stable identifier for a media asset. Each uploaded file revision gets a new `versionId` and is stored under a unique immutable object key. The `Media` record points to the current version through `currentVersionId`.

Storage objects are never overwritten during normal updates. A version promotion only updates database pointers after the replacement file and derived assets are ready.

Updates follow the same lifecycle as new uploads: they are temporary by default and only become permanent after sealing. An uploaded replacement version must not affect the currently served file until the replacement version is sealed and promoted.

Terminology note: `seal` is MediaLit's existing API term. In broader industry language, this operation is usually called commit, promote, publish, finalize, or activate. In this PRD, sealing means committing/promoting a temporary upload or temporary version so it becomes the durable current version.

---

## 5. Storage Layout

Object storage should still be treated as a flat key-value namespace. The slash-delimited layout below is only a key naming convention, not a dependency on real folders or provider-specific directory behavior.

MediaLit should keep version authority in the database. The object key should be stored on `MediaVersion`, and cleanup, restore, URL generation, and promotion should use that recorded key. Prefix listing may be used for operational fallback or diagnostics, but it must not be required for correctness.

Recommended key convention for new version objects:

```txt
{mediaId}/versions/{versionId}/main.{ext}
{mediaId}/versions/{versionId}/thumb.webp
```

This intentionally extends the existing `{mediaId}/main.{ext}` convention instead of replacing it with `{versionId}/main.{ext}`.

Rationale:

1. Existing media objects are grouped by `mediaId`.
2. All versions of the same media asset remain visually and operationally grouped.
3. Whole-media deletion can target one media prefix as a fallback, while still using DB-stored keys for correctness.
4. A `versionId` alone does not communicate which media asset it belongs to during manual inspection or support debugging.
5. The structure clearly distinguishes the stable asset identity (`mediaId`) from immutable file revisions (`versionId`).

Alternative considered:

```txt
{versionId}/main.{ext}
{versionId}/thumb.webp
```

This is technically valid and keeps the current one-ID-per-object-prefix style, but it makes the storage layout less explainable because versions from the same media asset are scattered by opaque version IDs. MediaLit should only choose this if object keys must be completely version-centric or if there is a strong requirement to avoid exposing `mediaId` in version object keys.

### Private Bucket

Temporary versions, private final versions, and versions still being processed live in the private bucket.

```txt
private-bucket/
  {mediaId}/
    versions/
      {versionId}/
        main.{ext}
        thumb.webp
```

### Public Bucket

Public final versions and public thumbnails live in the public bucket.

```txt
public-bucket/
  {mediaId}/
    versions/
      {versionId}/
        main.{ext}
        thumb.webp
```

### Key Principles

| Object               | Bucket  | Key                                         |
| -------------------- | ------- | ------------------------------------------- |
| Pending upload       | Private | `{mediaId}/versions/{versionId}/main.{ext}` |
| Pending thumbnail    | Private | `{mediaId}/versions/{versionId}/thumb.webp` |
| Private current file | Private | `{mediaId}/versions/{versionId}/main.{ext}` |
| Public current file  | Public  | `{mediaId}/versions/{versionId}/main.{ext}` |
| Public thumbnail     | Public  | `{mediaId}/versions/{versionId}/thumb.webp` |

The object key includes `versionId`, so clients and CDNs can cache files aggressively without needing invalidation when a new version is promoted.

Thumbnails are always public after processing, including thumbnails for private media versions. Temporary thumbnails may start in the private bucket during processing, but the final thumbnail object must be promoted to the public bucket.

---

## 6. Database Model

### Media

The existing media record should remain the stable asset-level record.

```ts
interface Media {
    mediaId: string;
    userId: ObjectId;
    apikey: string;
    currentVersionId: string;
    originalFileName: string;
    accessControl: "public" | "private";
    caption?: string;
    group?: string;
    versionCount: number;
    temp?: boolean;
    createdAt: Date;
    updatedAt: Date;
}
```

`Media.originalFileName` should remain for backward compatibility and should reflect the current version's `originalFileName`.

### MediaVersion

A new version-level record stores file-specific metadata.

`originalFileName` is stored on each version because every replacement upload may use a different source filename. The stored object identity is `objectKey`; `MediaVersion` should not duplicate a separate `fileName` field derived from the object key.

`MediaVersion` should stay minimal. It stores only the facts required to locate, process, promote, restore, and clean up a specific file revision. Application-level ownership, access control, grouping, captioning, and API-key scoping live on the parent `Media` record and are resolved through `mediaId`.

```ts
interface MediaVersion {
    versionId: string;
    mediaId: string;
    versionNumber: number;
    baseVersionId?: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    checksum?: string;
    thumbnailGenerated: boolean;
    objectKey: string;
    thumbnailKey?: string;
    temp: boolean;
    sealedAt?: Date;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
```

### Indexes

Recommended indexes:

```ts
Media:        { userId: 1, apikey: 1, mediaId: 1 } unique
Media:        { userId: 1, apikey: 1, currentVersionId: 1 }
MediaVersion: { mediaId: 1, versionNumber: -1 }
MediaVersion: { mediaId: 1, versionId: 1 } unique
MediaVersion: { deletedAt: 1 }
```

---

## 7. API Surface

### Existing Routes

Existing create, get, list, seal, and delete routes should continue to work.

```txt
POST /media/create
POST /media/seal/:mediaId
POST /media/get/:mediaId
POST /media/get
DELETE /media/:mediaId
```

`GET` or `POST /media/get/:mediaId` returns the current version by default.

Initial uploads continue to use `POST /media/seal/:mediaId`. Internally, that operation seals and promotes the initial version for the media record. Clients should not need to know the initial `versionId` to complete the existing upload flow.

### New Routes

```txt
PUT    /media/:mediaId
POST   /media/:mediaId/resumable
GET    /media/:mediaId/versions
GET    /media/:mediaId/versions/:versionId
POST   /media/:mediaId/versions/:versionId/seal
POST   /media/:mediaId/versions/:versionId/restore
```

Replacement uploads must support both multipart uploads and resumable TUS uploads in v1.

The public API should present updates as updates to the media asset. Creating a `MediaVersion` is an internal side effect of the update operation, not a separate concept the client needs to request directly.

Clients cannot create standalone versions. MediaLit creates a new version automatically whenever a file replacement is uploaded through `PUT /media/:mediaId` or the resumable update flow.

`PUT /media/:mediaId` returns the automatically created temporary version:

```json
{
    "mediaId": "media_123",
    "versionId": "version_456",
    "versionNumber": 3,
    "baseVersionId": "version_123",
    "temp": true
}
```

Replacement uploads use the version-level seal route: `POST /media/:mediaId/versions/:versionId/seal`.

`POST /media/:mediaId/resumable` starts a resumable update upload and returns the automatically created temporary version plus the upload URL:

```json
{
    "mediaId": "media_123",
    "versionId": "version_456",
    "versionNumber": 3,
    "baseVersionId": "version_123",
    "temp": true,
    "uploadUrl": "/media/resumable/..."
}
```

### Optional Concurrency Header

Clients may provide the version they expect to replace:

```txt
If-Match-Version: {currentVersionId}
```

If the provided version does not match the current version, the API returns `409 Conflict`.

### Concurrency Model

MediaLit should allow multiple clients to upload replacement versions concurrently. Uploading a replacement is not the commit point; sealing is the commit point.

When an update upload starts, MediaLit records the current version as the replacement's `baseVersionId`:

```ts
MediaVersion.baseVersionId = Media.currentVersionId;
```

Seal succeeds only if the version was based on the still-current version. This prevents lost updates when two clients upload replacements at the same time.

Example:

```txt
v1 is current

Client A uploads v2 with baseVersionId = v1
Client B uploads v3 with baseVersionId = v1

Client A seals v2 successfully
Media.currentVersionId = v2

Client B tries to seal v3
API returns 409 Conflict because v3.baseVersionId != Media.currentVersionId
```

Concurrent uploads should not be rejected at upload time. Correctness is enforced at seal time.

---

## 8. REST API Documentation, SDK, and MCP

This feature must update the generated REST API documentation, the `medialit` server SDK, and the MCP server tools.

### REST API Documentation

The OpenAPI/swagger documentation must include:

1. `PUT /media/:mediaId` for multipart file replacement.
2. `POST /media/:mediaId/resumable` for resumable replacement upload creation.
3. `GET /media/:mediaId/versions` for listing versions.
4. `GET /media/:mediaId/versions/:versionId` for fetching one version.
5. `POST /media/:mediaId/versions/:versionId/seal` for committing a temporary replacement.
6. `POST /media/:mediaId/versions/:versionId/restore` for restoring an existing version.
7. Request and response schemas for `MediaVersion`, update responses, version lists, resumable update responses, and version seal/restore responses.
8. `409 Conflict` behavior for `If-Match-Version` mismatches.
9. Documentation that initial uploads still use `POST /media/seal/:mediaId`, while replacement uploads use the version-level seal route.
10. Documentation that `DELETE /media/:mediaId` deletes the entire media asset and all versions, with no v1 endpoint for deleting a single version.

The generated REST API docs are backed by:

```txt
apps/api/src/swagger-generator.ts
apps/api/src/swagger_output.json
apps/docs/lib/openapi.ts
```

Route swagger comments and Joi/OpenAPI schemas should be updated with the API implementation so the docs site receives the new endpoints automatically.

### `medialit` SDK

The server SDK in `packages/medialit` must expose versioning support without requiring users to manually create versions.

Recommended SDK additions:

```ts
client.update(mediaId, file, options?)
client.startResumableUpload(metadata, options?)
client.startResumableUpdate(mediaId, metadata, options?)
client.listVersions(mediaId)
client.getVersion(mediaId, versionId)
client.sealVersion(mediaId, versionId, options?)
client.restoreVersion(mediaId, versionId, options?)
```

SDK behavior:

1. `client.update()` calls `PUT /media/:mediaId` and returns the temporary `MediaVersion` response containing `versionId`.
2. `client.startResumableUpload()` wraps the existing REST TUS/resumable initial-upload flow.
3. `client.startResumableUpdate()` calls `POST /media/:mediaId/resumable` and returns `versionId` plus the upload URL.
4. SDK resumable helpers should handle server-side programming needs such as upload URLs, offsets, retries, file streams, and optional progress callbacks where practical.
5. `client.seal(mediaId)` remains the existing initial-upload seal method.
6. `client.sealVersion(mediaId, versionId)` seals and promotes replacement versions.
7. `client.restoreVersion(mediaId, versionId)` repoints the current version to an existing restorable version.
8. SDK types should include minimal `MediaVersion`, update response, resumable update response, and optional `If-Match-Version` support.
9. Existing SDK methods must remain backward compatible.

Relevant SDK files:

```txt
packages/medialit/src/index.ts
packages/medialit/src/types.ts
packages/medialit/README.md
packages/medialit/__tests__/index.test.ts
```

The SDK README and tests should be updated with examples for updating a file, sealing a replacement version, listing versions, and restoring a version.

### MCP Server

The MCP server should expose versioning support with tool behavior that mirrors the REST API and SDK. MCP clients should not manually create versions; versions are created automatically when an update tool uploads a replacement file.

Recommended MCP tool additions:

```txt
update_media
list_media_versions
get_media_version
seal_media_version
restore_media_version
```

MCP tool behavior:

1. `upload_media` remains the initial temporary upload tool.
2. `seal_media` remains the initial-upload seal tool and should describe seal as commit/promote/finalize.
3. `update_media` accepts `mediaId`, base64 file content, filename, MIME type, and optional `ifMatchVersion`. It uploads a replacement and returns the temporary `MediaVersion` response containing `versionId` and `baseVersionId`.
4. `seal_media_version` accepts `mediaId`, `versionId`, and optional `ifMatchVersion`; it commits/promotes the temporary replacement version.
5. `list_media_versions` and `get_media_version` expose version history for inspection and restore workflows.
6. `restore_media_version` accepts `mediaId`, `versionId`, and optional `ifMatchVersion`; it repoints `Media.currentVersionId` to an existing sealed version.
7. `delete_media` keeps whole-asset behavior and deletes all versions through the existing media deletion semantics.
8. MCP must not expose a v1 tool for deleting a single version.
9. MCP should not support large resumable uploads. MCP tools are request/response oriented and current upload tools accept base64 content, which is suitable for simple agent workflows but not large resumable transfers.
10. A future MCP helper may create a resumable upload URL for use outside MCP, but chunk transfer, offset management, and retries should remain REST/SDK responsibilities.

MCP schemas should add a minimal `MediaVersion` shape and response schemas for update, list versions, get version, seal version, and restore version.

MCP implementation must reuse the API's shared service, validation, and storage helpers instead of duplicating versioning or upload logic inside MCP tools. MCP tools should be thin adapters over the same media services used by REST handlers so lifecycle behavior, quota checks, access checks, thumbnail generation, cleanup semantics, and conflict handling stay consistent.

Relevant MCP files:

```txt
apps/api/src/mcp/tools/media.ts
apps/api/src/mcp/tools/upload.ts
apps/api/src/mcp/tools/schemas.ts
apps/api/src/mcp/server.ts
apps/api/__tests__/mcp/media-tool.test.ts
apps/api/__tests__/mcp/upload-tool.test.ts
```

MCP tool descriptions should make the lifecycle explicit: update uploads create temporary versions, and `seal_media_version` is the commit/promote step. Concurrent update conflicts should return a structured MCP error result that corresponds to REST `409 Conflict`.

### Cross-Surface Parity

REST API, MCP tools, and the `medialit` SDK must stay in sync. A behavior added to one surface should have an equivalent on the others unless explicitly marked out of scope.

Resumable upload is the explicit parity exception for MCP. REST and SDK should support resumable upload/update; MCP should support simple base64 upload/update only and should not support large resumable uploads.

Required parity:

| Capability                    | REST API                                           | SDK                                                   | MCP                     |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Initial upload                | `POST /media/create`                               | `client.upload()`                                     | `upload_media`          |
| Initial seal/commit           | `POST /media/seal/:mediaId`                        | `client.seal(mediaId)`                                | `seal_media`            |
| Multipart update              | `PUT /media/:mediaId`                              | `client.update(mediaId, file, options?)`              | `update_media`          |
| Resumable initial upload      | Existing TUS/resumable REST flow                   | `client.startResumableUpload(...)`                    | Not supported           |
| Resumable update              | `POST /media/:mediaId/resumable`                   | `client.startResumableUpdate(...)`                    | Not supported           |
| List versions                 | `GET /media/:mediaId/versions`                     | `client.listVersions(mediaId)`                        | `list_media_versions`   |
| Get version                   | `GET /media/:mediaId/versions/:versionId`          | `client.getVersion(mediaId, versionId)`               | `get_media_version`     |
| Seal replacement              | `POST /media/:mediaId/versions/:versionId/seal`    | `client.sealVersion(mediaId, versionId, options?)`    | `seal_media_version`    |
| Restore version               | `POST /media/:mediaId/versions/:versionId/restore` | `client.restoreVersion(mediaId, versionId, options?)` | `restore_media_version` |
| Delete media and all versions | `DELETE /media/:mediaId`                           | `client.delete(mediaId)`                              | `delete_media`          |
| Delete one version            | Out of scope v1                                    | Out of scope v1                                       | Out of scope v1         |

Parity rules:

1. Response shapes should use the same field names across REST, SDK, and MCP, including `mediaId`, `versionId`, `versionNumber`, `baseVersionId`, `temp`, `sealedAt`, and `deletedAt`.
2. Conflict behavior should be consistent: stale `baseVersionId` or `If-Match-Version` mismatch maps to REST `409`, SDK thrown conflict error, and MCP structured error result.
3. Initial upload seal and replacement version seal must remain distinct on all surfaces.
4. No surface should expose standalone user-created versions in v1.
5. No surface should expose single-version deletion in v1.
6. Documentation and tests must cover each supported surface for the same lifecycle: upload, seal, update, seal replacement, list versions, restore, delete media.

---

## 9. Update Flow

Replacement versions use a staged update model:

```txt
upload temporary replacement and derived assets -> seal version -> promote as current
```

The existing current version remains live throughout upload and processing. If the replacement upload fails or is never sealed, the existing current version continues to serve normally.

### Stage 1 - Upload Replacement File

1. Client uploads a replacement file to `PUT /media/:mediaId`.
2. API validates ownership, quota, file size, access, and optional `If-Match-Version`.
3. API generates a new `versionId`.
4. API records the current `Media.currentVersionId` as `MediaVersion.baseVersionId`.
5. API uploads the file to the private bucket using an immutable key:

    ```txt
    {mediaId}/versions/{versionId}/main.{ext}
    ```

6. API generates the thumbnail synchronously if supported, using the same behavior as the current initial upload flow.
7. API stores the thumbnail under:

    ```txt
    {mediaId}/versions/{versionId}/thumb.webp
    ```

8. API calculates checksum if enabled.
9. API creates a `MediaVersion` record with `temp: true`.
10. API does not update `Media.currentVersionId`.
11. API returns the created `versionId` and `baseVersionId` to the client.

### Stage 2 - Temporary Version Ready

For v1, MediaLit should continue its current synchronous processing model. The replacement version is sealable only after the main file and supported derived assets have been written.

Async thumbnail or derivative processing may be introduced later for scalability, but it is not part of the v1 versioning behavior.

### Resumable Update Flow

Resumable updates use the same version lifecycle as multipart updates.

1. Client starts a resumable update with `POST /media/:mediaId/resumable`.
2. API validates the parent `Media` record, ownership, quota, file metadata, and optional `If-Match-Version`.
3. API generates a new `versionId`.
4. API records the current `Media.currentVersionId` as `MediaVersion.baseVersionId`.
5. API creates a `MediaVersion` record with `temp: true`.
6. API returns the `versionId`, `baseVersionId`, and resumable upload URL.
7. Client uploads file chunks through the TUS flow.
8. On TUS finalize, MediaLit stores the completed file at:

    ```txt
    {mediaId}/versions/{versionId}/main.{ext}
    ```

9. MediaLit generates derived assets synchronously if applicable, using the same behavior as current TUS finalization.
10. MediaLit updates the version metadata after the completed file and derived assets are written.
11. API does not update `Media.currentVersionId`.
12. Client seals the version with `POST /media/:mediaId/versions/:versionId/seal`.

Resumable upload completion must not auto-promote the replacement. Finalization only makes the version sealable; sealing is the commit step.

### Stage 3 - Seal and Promote Version

When the version is sealable, the client calls `POST /media/:mediaId/versions/:versionId/seal`. MediaLit then promotes it as the current version.

Seal preconditions:

1. The version belongs to the media record.
2. The version has `temp: true`.
3. The version has its required file metadata.
4. The version's required storage objects exist.
5. The version does not have `deletedAt`.
6. `MediaVersion.baseVersionId` still equals `Media.currentVersionId`.
7. The optional `If-Match-Version` value still matches the current version.

For private media:

1. Keep main file in the private bucket.
2. Copy the thumbnail to the public bucket if generated.
3. Update the DB current pointer.

For public media:

1. Copy the main file from the private bucket to the public bucket.
2. Copy the thumbnail to the public bucket.
3. Update the DB current pointer.

Bucket selection is derived from `Media.accessControl`, version state, and object type:

| Version state                              | Object    | Bucket  |
| ------------------------------------------ | --------- | ------- |
| Temporary or unsealed                      | Main file | Private |
| Temporary or unsealed                      | Thumbnail | Private |
| Sealed and `Media.accessControl = private` | Main file | Private |
| Sealed and `Media.accessControl = public`  | Main file | Public  |
| Sealed                                     | Thumbnail | Public  |

`MediaVersion` stores object keys, not bucket policy. Access and bucket behavior are controlled by the parent `Media` record.

If `Media.accessControl` changes after versions exist, MediaLit must reconcile sealed main-file objects to the bucket implied by the new access policy before serving or restoring those versions. This can be done eagerly during the access-control update or lazily before URL generation/restore, but the invariant remains: parent media access controls version access.

Promotion must use a database compare-and-swap update:

```ts
await Media.updateOne(
    {
        mediaId,
        userId,
        apikey,
        currentVersionId: version.baseVersionId,
    },
    {
        $set: {
            currentVersionId: newVersionId,
            updatedAt: new Date(),
        },
        $inc: {
            versionCount: 1,
        },
    },
);
```

If no record is updated, another update won the race. The API should return `409 Conflict` or retry based on endpoint semantics.

### Stage 4 - Supersede Previous Version

After promotion succeeds:

1. Set `temp: false` and `sealedAt` on the new version.
2. Keep old version objects until retention cleanup runs.
3. Derive the current version from `Media.currentVersionId`.
4. Derive superseded versions as sealed versions where `versionId !== Media.currentVersionId`.

---

## 10. Restore Flow

Restoring a version should simply repoint the media record to the selected immutable version.

1. Client calls `POST /media/:mediaId/versions/:versionId/restore`.
2. API validates that the target version belongs to the media and is restorable.
3. API validates that the target version's required objects still exist in the expected bucket.
4. API promotes the selected version using the same compare-and-swap flow.
5. API updates `Media.currentVersionId` to the restored version ID.

Restore does not copy objects or create a new version ID. This keeps rollback fast and avoids unnecessary storage duplication.

---

## 11. URL Generation

### Versioned Object URLs

Returned file URLs should resolve to immutable version keys:

```txt
{mediaId}/versions/{versionId}/main.{ext}
```

This avoids overwrites and CDN invalidation requirements.

### Stable Media URLs

If MediaLit needs a stable URL for clients, expose an API-level redirect or resolver:

```txt
GET /media/:mediaId/file
GET /media/:mediaId/thumbnail
```

The resolver reads `currentVersionId` from the database and returns or redirects to the correct signed or public URL.

---

## 12. Deletion and Retention

All retained versions count against user storage quota, including superseded versions.

There is no single universal retention standard for media version history. MediaLit should use a configurable retention policy with a default of 30 days for superseded versions. This default is long enough to recover from accidental updates while limiting unbounded storage growth.

### Deleting a Media Asset

Deleting a media asset should:

1. Mark `Media` as deleted or remove it according to existing behavior.
2. Set `deletedAt` on all associated `MediaVersion` records or remove them according to existing delete behavior.
3. Queue physical object deletion for all version keys.

The existing media delete API remains the authoritative whole-asset deletion behavior. Versioning should tack onto that behavior by expanding the cleanup scope from one object pair to all version object pairs for the media.

### Specific Version Deletion

Specific version deletion is out of scope for v1. Users cannot manually delete an individual version through the public API.

In v1:

1. `DELETE /media/:mediaId` deletes the whole media asset and all versions.
2. Superseded versions are derived from `Media.currentVersionId` and removed by retention cleanup.
3. Tombstoned, orphaned, and unsealed temporary versions are removed by cleanup jobs.
4. Retained versions count against user storage quota until their objects are physically removed.

Future v2 scope may add `DELETE /media/:mediaId/versions/:versionId` for manual pruning of non-current versions. If added, it should reuse the same authentication, ownership checks, storage deletion helpers, error handling, and cleanup semantics as the existing media delete behavior.

### Cleanup Job

A background cleanup job should remove:

1. Superseded versions older than the configured retention window.
2. Tombstoned versions after retention expires.
3. Orphaned private objects from interrupted uploads.
4. Temporary replacement versions that were uploaded but not sealed within the configured temporary upload expiration window.
5. Temporary replacement versions that became stale because another version was sealed first.

The cleanup job should rely on database records first. Prefix listing may be used as a convenience, but should not be the only source of correctness.

Implementation should extend the existing media cleanup module:

```txt
apps/api/src/media/cleanup.ts
```

The current `cleanupExpiredTempUploads()` job should remain responsible for initial temporary media uploads. Version retention should be added as a sibling cleanup function, for example:

```ts
cleanupExpiredMediaVersions();
```

Cleanup ownership:

| Cleanup target                                                                       | Owning function                 |
| ------------------------------------------------------------------------------------ | ------------------------------- |
| Initial media upload with `Media.temp: true`                                         | `cleanupExpiredTempUploads()`   |
| Failed initial media upload before seal                                              | `cleanupExpiredTempUploads()`   |
| Update upload with `MediaVersion.temp: true`                                         | `cleanupExpiredMediaVersions()` |
| Stale or abandoned update/version upload represented by `MediaVersion.temp: true`    | `cleanupExpiredMediaVersions()` |
| Superseded version past retention, derived by `versionId !== Media.currentVersionId` | `cleanupExpiredMediaVersions()` |
| Deleted/tombstoned version awaiting object deletion                                  | `cleanupExpiredMediaVersions()` |

Rule of thumb: if the cleanup target is represented by a `MediaVersion` record, `cleanupExpiredMediaVersions()` owns it. If the cleanup target is the initial temporary `Media` record, `cleanupExpiredTempUploads()` owns it.

`apps/api/src/index.ts` should invoke both media cleanup functions from the existing hourly cleanup interval. The existing manual cleanup route may either call both functions or a new internal route can be added for version cleanup.

Retention cleanup should:

1. Find sealed `MediaVersion` records where `versionId !== Media.currentVersionId`, `deletedAt` is empty, and `sealedAt` is older than the configured retention window.
2. Find temporary version records with `temp: true` and `createdAt` older than `TEMP_MEDIA_EXPIRATION_HOURS`.
3. Find stale temporary version records where `temp: true` and `baseVersionId !== Media.currentVersionId`.
4. Delete the known `objectKey` and `thumbnailKey` from buckets resolved from `Media.accessControl`, version state, and object type.
5. Mark cleanup progress in the database before or after physical deletion so retries are idempotent.
6. Remove or tombstone the `MediaVersion` record after object deletion succeeds.

Retention cleanup must never delete the version referenced by `Media.currentVersionId`, even if that version appears old enough for retention.

---

## 13. Worker Architecture

For v1, thumbnail and derivative processing remains synchronous during upload or TUS finalization. Background work is limited to cleanup and retry-safe deletion.

Recommended jobs:

1. `cleanup-expired-media-versions`
2. `delete-media-version-objects`
3. `cleanup-expired-temp-uploads`
4. `cleanup-expired-tus-uploads`

Jobs should be idempotent. Re-running a job should not delete the current version or corrupt version history.

Async version processing may be introduced in a future version, but it is not part of the v1 update/versioning scope.

---

## 14. Error Handling

| Failure                    | Expected Behavior                                                             |
| -------------------------- | ----------------------------------------------------------------------------- |
| Upload fails               | Do not create a current version                                               |
| Thumbnail generation fails | Version may still be promoted with `thumbnailGenerated: false`                |
| Public copy fails          | Keep version non-current and retry or leave the temporary version for cleanup |
| DB promotion conflict      | Return `409 Conflict` or retry safely                                         |
| Version is never sealed    | Cleanup removes the temporary version without changing the current version    |
| Cleanup delete fails       | Retry later without changing current version                                  |

The existing current version must remain valid until promotion fully succeeds.

---

## 15. Migration Strategy

Existing media requires a database migration. S3/storage migration is not required.

### Required DB Migration

Every existing media record should get an explicit initial version record. Today, the existing `Media` record is effectively an implicit current version. Migration makes that implicit version explicit without changing the public `mediaId`.

1. Add `currentVersionId` to `Media`.
2. Create one `MediaVersion` for each existing media record.
3. Use `versionNumber: 1`.
4. Point `objectKey` to the existing object key.
5. Set `currentVersionId` to the generated version ID.
6. Set `temp: false` and `sealedAt` on the generated version.

Example:

```txt
Existing object:
{mediaId}/main.{ext}

Generated DB version:
Media.currentVersionId = {versionId}
MediaVersion.objectKey = {mediaId}/main.{ext}
MediaVersion.versionNumber = 1
MediaVersion.temp = false
MediaVersion.sealedAt = media.updatedAt ?? media.createdAt
```

### Idempotent Migration Script

Create a migration script for the required DB migration. The script must be idempotent and safe to run multiple times.

Script location and command:

```txt
packages/scripts/src/migrate-to-versioning.ts
pnpm --filter @medialit/scripts migrate:versioning
```

The `packages/scripts` package should expose this command as `migrate:versioning`.

Script behavior:

1. Find media records that do not have `currentVersionId`.
2. For each unmigrated media record, create exactly one initial `MediaVersion`.
3. Set `Media.currentVersionId` to the created version ID.
4. Skip media records that already have `currentVersionId`.
5. Skip or repair records that already have a matching `MediaVersion`, rather than creating duplicates.
6. Use a stable uniqueness constraint such as `{ mediaId, versionNumber: 1 }` or `{ mediaId, versionId }` to prevent duplicate initial versions.
7. Log migrated, skipped, repaired, and failed counts.
8. Continue processing other records if one record fails.

The migration should only migrate unmigrated records. Running it repeatedly must not create additional versions for already-migrated media.

### S3/Storage Migration Not Required

Existing objects do not need to be copied or moved during the initial rollout. `MediaVersion.objectKey` can point to the existing object key.

A later background job may copy existing objects into the new versioned key layout for housekeeping or consistency:

```txt
{mediaId}/main.{ext}
-> {mediaId}/versions/{versionId}/main.{ext}
```

This is not a required migration because it has no product impact. The API must support both legacy object keys and new versioned object keys as long as they are recorded on `MediaVersion`.

New uploads and replacement uploads after this feature ships should use the versioned key layout.

---

## 16. Open Questions

None at this stage.

Resolved decisions:

1. Old versions count against user storage quota.
2. Superseded versions use a configurable retention policy with a default of 30 days.
3. Thumbnails are always public.
4. Restore simply repoints to an existing immutable version.
5. Version updates support resumable TUS uploads in v1.
6. `MediaVersion` remains a minimal operational record. Version display names or changelog notes can be added later as separate version metadata if needed.
