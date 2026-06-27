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
8. Provide a clear cleanup path for old, failed, and deleted versions.
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

---

## 5. Storage Layout

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

### MediaVersion

A new version-level record stores file-specific metadata.

```ts
interface MediaVersion {
    versionId: string;
    mediaId: string;
    userId: ObjectId;
    apikey: string;
    versionNumber: number;
    status:
        | "pending"
        | "processing"
        | "ready"
        | "current"
        | "superseded"
        | "failed"
        | "deleted";
    fileName: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    checksum?: string;
    thumbnailGenerated: boolean;
    objectKey: string;
    thumbnailKey?: string;
    objectBucket: "private" | "public";
    thumbnailBucket?: "public";
    displayName?: string;
    changeNote?: string;
    replacedVersionId?: string;
    temp: boolean;
    sealedAt?: Date;
    failureReason?: string;
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
MediaVersion: { userId: 1, apikey: 1, mediaId: 1, versionNumber: -1 }
MediaVersion: { mediaId: 1, versionId: 1 } unique
MediaVersion: { status: 1, updatedAt: 1 }
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

`PUT /media/:mediaId` and the resumable metadata flow should accept optional `displayName` and `changeNote` fields.

The public API should present updates as updates to the media asset. Creating a `MediaVersion` is an internal side effect of the update operation, not a separate concept the client needs to request directly.

Clients cannot create standalone versions. MediaLit creates a new version automatically whenever a file replacement is uploaded through `PUT /media/:mediaId` or the resumable update flow.

`PUT /media/:mediaId` returns the automatically created temporary version:

```json
{
    "mediaId": "media_123",
    "versionId": "version_456",
    "versionNumber": 3,
    "status": "processing",
    "temp": true
}
```

Replacement uploads use the version-level seal route: `POST /media/:mediaId/versions/:versionId/seal`.

### Optional Concurrency Header

Clients may provide the version they expect to replace:

```txt
If-Match-Version: {currentVersionId}
```

If the provided version does not match the current version, the API returns `409 Conflict`.

---

## 8. Update Flow

Replacement versions use a staged update model:

```txt
upload temporary replacement -> process derived assets -> seal version -> promote as current
```

The existing current version remains live throughout upload and processing. If the replacement upload fails or is never sealed, the existing current version continues to serve normally.

### Stage 1 - Upload Replacement File

1. Client uploads a replacement file to `PUT /media/:mediaId`.
2. API validates ownership, quota, file size, access, and optional `If-Match-Version`.
3. API generates a new `versionId`.
4. API uploads the file to the private bucket using an immutable key:

    ```txt
    {mediaId}/versions/{versionId}/main.{ext}
    ```

5. API creates a `MediaVersion` record with `status: "processing"` and `temp: true`.
6. API does not update `Media.currentVersionId`.
7. API returns the created `versionId` to the client.

### Stage 2 - Process Derived Assets

1. Generate thumbnail if supported.
2. Calculate checksum if enabled.
3. Store thumbnail under:

    ```txt
    {mediaId}/versions/{versionId}/thumb.webp
    ```

4. Mark the version `ready`.

Small files may be processed synchronously. Large files should be handed to a background worker.

### Stage 3 - Seal and Promote Version

When the version is ready, the client calls `POST /media/:mediaId/versions/:versionId/seal`. MediaLit then promotes it as the current version.

Seal preconditions:

1. The version belongs to the media record.
2. The version has `temp: true`.
3. The version is `ready`.
4. The version's required storage objects exist.
5. The optional `If-Match-Version` value still matches the current version.

For private media:

1. Keep main file in the private bucket.
2. Copy the thumbnail to the public bucket if generated.
3. Update the DB current pointer.

For public media:

1. Copy the main file from the private bucket to the public bucket.
2. Copy the thumbnail to the public bucket.
3. Update `MediaVersion.objectBucket` to `public`.
4. Update the DB current pointer.

Promotion must use a database compare-and-swap update:

```ts
await Media.updateOne(
    {
        mediaId,
        userId,
        apikey,
        currentVersionId: expectedCurrentVersionId,
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

1. Mark the previous current version as `superseded`.
2. Mark the new version as `current`.
3. Set `temp: false` and `sealedAt` on the new version.
4. Keep old version objects until retention cleanup runs.

---

## 9. Restore Flow

Restoring a version should simply repoint the media record to the selected immutable version.

1. Client calls `POST /media/:mediaId/versions/:versionId/restore`.
2. API validates that the target version belongs to the media and is restorable.
3. API validates that the target version's required objects still exist in the expected bucket.
4. API promotes the selected version using the same compare-and-swap flow.
5. API marks the previous current version as `superseded` and the restored version as `current`.

Restore does not copy objects or create a new version ID. This keeps rollback fast and avoids unnecessary storage duplication.

---

## 10. URL Generation

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

## 11. Deletion and Retention

All retained versions count against user storage quota, including superseded versions.

There is no single universal retention standard for media version history. MediaLit should use a configurable retention policy with a default of 30 days for superseded versions. This default is long enough to recover from accidental updates while limiting unbounded storage growth.

### Deleting a Media Asset

Deleting a media asset should:

1. Mark `Media` as deleted or remove it according to existing behavior.
2. Mark all associated `MediaVersion` records as `deleted`.
3. Queue physical object deletion for all version keys.

The existing media delete API remains the authoritative whole-asset deletion behavior. Versioning should tack onto that behavior by expanding the cleanup scope from one object pair to all version object pairs for the media.

### Specific Version Deletion

Specific version deletion is out of scope for v1. Users cannot manually delete an individual version through the public API.

In v1:

1. `DELETE /media/:mediaId` deletes the whole media asset and all versions.
2. Superseded versions are removed by retention cleanup.
3. Failed, deleted, orphaned, and unsealed temporary versions are removed by cleanup jobs.
4. Retained versions count against user storage quota until their objects are physically removed.

Future v2 scope may add `DELETE /media/:mediaId/versions/:versionId` for manual pruning of non-current versions. If added, it should reuse the same authentication, ownership checks, storage deletion helpers, error handling, and cleanup semantics as the existing media delete behavior.

### Cleanup Job

A background cleanup job should remove:

1. Failed versions older than a configured threshold.
2. Deleted versions after retention expires.
3. Orphaned private objects from interrupted uploads.
4. Temporary replacement versions that were uploaded but not sealed within the configured temporary upload expiration window.

The cleanup job should rely on database records first. Prefix listing may be used as a convenience, but should not be the only source of correctness.

---

## 12. Worker Architecture

Version processing should be safe to run asynchronously.

Recommended jobs:

1. `process-media-version`
2. `promote-media-version`
3. `cleanup-media-version`
4. `delete-media-version-objects`

Jobs should be idempotent. Re-running a job should not create duplicate current versions or corrupt version history.

---

## 13. Error Handling

| Failure                    | Expected Behavior                                                          |
| -------------------------- | -------------------------------------------------------------------------- |
| Upload fails               | Do not create a current version                                            |
| Thumbnail generation fails | Version may still be promoted with `thumbnailGenerated: false`             |
| Public copy fails          | Keep version non-current and mark `failed` or retry                        |
| DB promotion conflict      | Return `409 Conflict` or retry safely                                      |
| Version is never sealed    | Cleanup removes the temporary version without changing the current version |
| Cleanup delete fails       | Retry later without changing current version                               |

The existing current version must remain valid until promotion fully succeeds.

---

## 14. Migration Strategy

Existing media records can be migrated into versioned records.

1. Add `currentVersionId` to `Media`.
2. Create one `MediaVersion` for each existing media record.
3. Use `versionNumber: 1`.
4. Point `objectKey` to the existing object key.
5. Set `currentVersionId` to the generated version ID.
6. Set version status to `current`.

Object movement is optional for the initial migration. Existing keys may continue to work. A later background migration can copy objects into the new versioned key layout.

---

## 15. Open Questions

None at this stage.

Resolved decisions:

1. Old versions count against user storage quota.
2. Superseded versions use a configurable retention policy with a default of 30 days.
3. Thumbnails are always public.
4. Restore simply repoints to an existing immutable version.
5. Version updates support resumable TUS uploads in v1.
6. Clients can attach version names and changelog notes.
