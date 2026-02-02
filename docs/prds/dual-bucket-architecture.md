<!-- 7a76a1e6-567a-4eb9-af59-0cbb8c29e87a 8efac62c-835f-42a7-9323-091793976335 -->

# Product Requirements Document (PRD)

**Title:**

Dual-Bucket Architecture for S3-Compatible Storage Providers

**Product:**

MediaLit — Cloud Digital Asset Management Service

**Author:**

Rajat Saxena

**Version:**

v1.0 — December 2024

---

## 1. Overview

MediaLit currently uses a single S3 bucket with path-based separation (`/tmp`, `/private`, `/public`) and relies on bucket policies for access control. However, some S3-compatible storage providers (notably Cloudflare R2) do not support bucket policies, making this architecture incompatible.

This PRD defines a dual-bucket architecture that:

- Uses separate buckets for private and public files
- Eliminates path prefixes (no `/tmp`, `/private`, `/public` in paths)
- Supports all target S3-compatible providers: AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, Wasabi, and MinIO
- Maintains the existing temp → seal → cleanup lifecycle

---

## 2. Objectives

1. **Bucket Separation**: Deploy private files to `CLOUD_BUCKET_NAME` and public files to `CLOUD_PUBLIC_BUCKET_NAME`
2. **Path Simplification**: Remove path prefixes; use flat structure: `{mediaId}/main.{ext}` and `{mediaId}/thumb.webp`
3. **Provider Compatibility**: Ensure architecture works with all listed S3-compatible storage providers
4. **Lifecycle Preservation**: Maintain temp → seal → cleanup flow
5. **Backward Compatibility**: Support existing deployments (with migration path)
6. **Access Control**: Private bucket requires signed URLs; public bucket allows direct access

---

## 3. Storage Architecture

### Bucket Structure

**Private Bucket (`CLOUD_BUCKET_NAME`):**

```
s3://private-bucket/
  ├── {mediaId1}/
  │   ├── main.{ext}          # temp or private files
  │   └── thumb.webp          # temp thumbnails (before sealing)
  ├── {mediaId2}/
  │   └── main.{ext}
  └── ...
```

**Public Bucket (`CLOUD_PUBLIC_BUCKET_NAME`):**

```
s3://public-bucket/
  ├── {mediaId1}/
  │   ├── main.{ext}          # sealed public files
  │   └── thumb.webp          # all sealed thumbnails (always public)
  ├── {mediaId2}/
  │   └── main.{ext}
  └── ...
```

### Key Principles

| File Type | Bucket | Path Structure | Access Method |

|-----------|--------|----------------|---------------|

| Temp uploads | Private | `{mediaId}/main.{ext}` | Signed URL (internal) |

| Temp thumbnails | Private | `{mediaId}/thumb.webp` | Signed URL (internal) |

| Private sealed files | Private | `{mediaId}/main.{ext}` | Signed URL |

| Public sealed files | Public | `{mediaId}/main.{ext}` | Direct HTTP/CDN |

| Sealed thumbnails | Public | `{mediaId}/thumb.webp` | Direct HTTP/CDN |

---

## 4. Configuration

### Environment Variables

**Required:**

- `CLOUD_BUCKET_NAME` - Private bucket (temp and private files)
- `CLOUD_PUBLIC_BUCKET_NAME` - Public bucket (public files and all thumbnails)

**Shared Configuration (applies to both buckets):**

- `CLOUD_ENDPOINT` - S3 endpoint URL
- `CLOUD_REGION` - Region (if applicable)
- `CLOUD_KEY` - Access key ID
- `CLOUD_SECRET` - Secret access key
- `PATH_PREFIX` - Optional prefix (if needed for multi-tenant)

**Note**: Both buckets MUST use the same credentials and endpoint. Different credentials/endpoints per bucket are out of scope for v1.

---

## 5. Lifecycle Flow

### Stage 1: Upload (Temporary)

**Routes:**

- `POST /media/create` (multipart upload)
- `POST /media/create/resumable` (TUS upload)

**Process:**

1. Generate `mediaId` (nanoid)
2. Upload main file to private bucket: `{mediaId}/main.{ext}`
3. Optionally generate and upload thumbnail to private bucket: `{mediaId}/thumb.webp`
4. Create DB record with `temp: true`

**Implementation:**

- `putObject()` uses `CLOUD_BUCKET_NAME`
- Key generation: `{PATH_PREFIX}/{mediaId}/main.{ext}` (if prefix exists)

---

### Stage 2: Seal (Finalize)

**Route:**

- `POST /media/seal/{mediaId}`

**Process:**

1. Retrieve media record and determine access control
2. **Main file:**

    - If `accessControl === "public"`: Copy from private bucket → public bucket
    - If `accessControl === "private"`: Move within private bucket (or copy if cross-bucket move not supported)

3. **Thumbnail (if exists):**

    - Always copy from private bucket → public bucket

4. Delete temp files from private bucket
5. Update DB record: `temp: undefined`

**Implementation Details:**

- Use `CopyObjectCommand` with source bucket + key and destination bucket + key
- For same-bucket moves (private → private), use copy + delete
- For cross-bucket copies (private → public), use copy from source bucket to destination bucket
- After successful copy, delete source objects

**Key Generation:**

- Source: `{PATH_PREFIX}/{mediaId}/main.{ext}` in private bucket
- Destination: `{PATH_PREFIX}/{mediaId}/main.{ext}` in public bucket (for public) or same private bucket (for private)

---

### Stage 3: Cleanup (Background Job)

**Schedule:** Every N hours (configurable via `TEMP_MEDIA_EXPIRATION_HOURS`)

**Process:**

1. Find expired temp media: `temp: true` and `createdAt < cutoff`
2. For each expired media:

    - Delete from private bucket: `{mediaId}/` (all objects with this prefix)
    - Delete DB record

**Implementation:**

- `deleteFolder()` operates on private bucket only
- Prefix: `{PATH_PREFIX}/{mediaId}/` (if prefix exists)

---

## 6. URL Generation

### Private Files (Signed URLs)

**Temp or Private Files:**

- Source: Private bucket
- Method: Generate signed URL using S3 presigner or CDN signer
- Key: `{PATH_PREFIX}/{mediaId}/main.{ext}` or `{PATH_PREFIX}/{mediaId}/thumb.webp`

**Implementation:**

```typescript
// For private bucket
const command = new GetObjectCommand({
    Bucket: CLOUD_BUCKET_NAME,
    Key: key,
});
const url = await getS3SignedUrl(s3Client, command);
```

### Public Files (Direct URLs)

**Public Files and Thumbnails:**

- Source: Public bucket
- Method: Direct HTTP URL or CDN URL
- Key: `{PATH_PREFIX}/{mediaId}/main.{ext}` or `{PATH_PREFIX}/{mediaId}/thumb.webp`

**Implementation:**

```typescript
// For public bucket
const url = `${PUBLIC_ENDPOINT}/${key}`; // or `${CDN_ENDPOINT}/${key}`
```

---

## 7. S3 Service Layer Changes

### Current Structure (`apps/api/src/services/s3.ts`)

**Required Changes:**

1. **Add Public Bucket Configuration:**

    - Import `CLOUD_PUBLIC_BUCKET_NAME` from constants
    - Create separate S3 client instances (or reuse with bucket parameter)

2. **Update `putObject()`:**

    - Add optional `bucket` parameter (defaults to `CLOUD_BUCKET_NAME`)
    - Use specified bucket for PutObjectCommand

3. **Update `copyObject()`:**

    - Modify to support cross-bucket copies
    - Add `sourceBucket` and `destinationBucket` parameters
    - Update `CopySource` format: `{sourceBucket}/{sourceKey}`

4. **Update `deleteObject()` and `deleteFolder()`:**

    - Add optional `bucket` parameter (defaults to `CLOUD_BUCKET_NAME`)

5. **Update `generateSignedUrl()`:**

    - Add optional `bucket` parameter (defaults to `CLOUD_BUCKET_NAME`)

6. **Update `getObjectTagging()`:**

    - Add optional `bucket` parameter (defaults to `CLOUD_BUCKET_NAME`)

---

## 8. Provider Compatibility

### Supported Providers

| Provider | Bucket Policies | Cross-Bucket Copy | Notes |

|----------|----------------|-------------------|-------|

| AWS S3 | ✅ Yes | ✅ Yes (same region) | Standard implementation |

| Cloudflare R2 | ❌ No | ✅ Yes | Primary use case |

| DigitalOcean Spaces | ✅ Yes | ✅ Yes | Works with bucket policies or dual-bucket |

| Backblaze B2 | ✅ Yes | ✅ Yes | Works with bucket policies or dual-bucket |

| Wasabi | ✅ Yes | ✅ Yes | Works with bucket policies or dual-bucket |

| MinIO | ✅ Yes | ✅ Yes | Works with bucket policies or dual-bucket |

### Cross-Bucket Copy Implementation

For all providers, use `CopyObjectCommand` with:

```typescript
CopySource: `${sourceBucket}/${sourceKey}`;
Bucket: destinationBucket;
Key: destinationKey;
```

**Note**: Some providers may have restrictions on cross-bucket copies (e.g., same region). Document these in deployment guides.

---

## 9. Database Model

No schema changes required. Existing `MediaSchema` with `temp` field remains valid.

**Access Control Logic:**

- `temp: true` → Private bucket, signed URL
- `temp: false` + `accessControl: "private"` → Private bucket, signed URL
- `temp: false` + `accessControl: "public"` → Public bucket, direct URL

---

## 10. Migration Strategy

### For Existing Deployments

**Option A: Gradual Migration (Recommended)**

1. Create new public bucket
2. Update code to use dual-bucket architecture
3. On seal operation, migrate existing files:

    - If public, copy from old location to new public bucket
    - If private, keep in private bucket (or move if needed)

4. Old files remain accessible during migration window

**Option B: One-Time Migration**

1. Scan all media records
2. Copy public files to new public bucket
3. Update URL generation logic
4. Remove old path prefixes from keys

**Migration Script Requirements:**

- Identify public vs private files from DB records
- Copy files to appropriate buckets
- Update any cached URLs or CDN invalidation

---

## 11. API Changes

### No Breaking Changes

All existing API endpoints remain unchanged:

- `POST /media/create` - Still works (uploads to private bucket)
- `POST /media/seal/{mediaId}` - Still works (moves to appropriate bucket)
- `GET /media/get` - Still works (URLs generated based on bucket)
- `GET /media/{mediaId}` - Still works (URLs generated based on bucket)

### Internal Changes Only

- S3 service layer accepts bucket parameters
- Key generation removes path prefixes
- URL generation selects bucket based on access control

---

## 12. Testing Requirements

### Unit Tests

- S3 service functions with bucket parameters
- Cross-bucket copy operations
- URL generation for both buckets
- Key generation without path prefixes

### Integration Tests

- Upload → Seal → Access flow for public files
- Upload → Seal → Access flow for private files
- Thumbnail always ends up in public bucket
- Cleanup removes from correct bucket

### Provider-Specific Tests

- Test with Cloudflare R2 (primary use case)
- Test with AWS S3 (baseline)
- Test with other providers (as needed)

---

## 13. Deployment Checklist

- [ ] Create `CLOUD_PUBLIC_BUCKET_NAME` bucket in storage provider
- [ ] Configure bucket permissions (public bucket: public read; private bucket: private)
- [ ] Set environment variable `CLOUD_PUBLIC_BUCKET_NAME`
- [ ] Verify `CLOUD_BUCKET_NAME` is set (private bucket)
- [ ] Deploy updated code
- [ ] Run migration script (if applicable)
- [ ] Verify upload → seal → access flow
- [ ] Monitor for any cross-bucket copy errors

---

## 14. Success Metrics

| Metric | Target |

|--------|--------|

| Dual-bucket architecture functional | 100% |

| Cloudflare R2 compatibility | ✅ Working |

| All listed providers supported | ✅ Working |

| Zero breaking API changes | ✅ Maintained |

| Migration path available | ✅ Documented |

---

## 15. Risks and Mitigations

| Risk | Mitigation |

|------|------------|

| Cross-bucket copy failures | Implement retry logic; fallback to download + upload |

| Provider-specific restrictions | Document provider limitations; test with each provider |

| Migration complexity | Provide clear migration scripts; support gradual migration |

| URL generation errors | Comprehensive testing; fallback to signed URLs if needed |

---

## 16. Deliverables

1. Updated S3 service layer with bucket parameter support
2. Updated media service with dual-bucket logic
3. Updated key generation (remove path prefixes)
4. Updated URL generation (bucket-aware)
5. Migration documentation and scripts (if applicable)
6. Provider-specific deployment guides
7. Updated tests for dual-bucket architecture

---

## 17. Summary

This PRD defines a dual-bucket architecture that eliminates path prefixes and uses separate buckets for private and public files. The architecture:

- ✅ Works with Cloudflare R2 (no bucket policies required)
- ✅ Works with all listed S3-compatible providers
- ✅ Maintains existing API contracts
- ✅ Simplifies path structure (no `/tmp`, `/private`, `/public` prefixes)
- ✅ Preserves temp → seal → cleanup lifecycle
- ✅ Always stores thumbnails in public bucket (for fast CDN delivery)

The implementation requires changes to the S3 service layer to support bucket parameters and cross-bucket operations, but maintains backward compatibility at the API level.
