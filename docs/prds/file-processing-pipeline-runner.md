# Product Requirements Document (PRD)

**Title:**

File Processing Pipeline Runner for MediaLit

**Product:**

MediaLit - Cloud Digital Asset Management Service

**Author:**

Codex

**Version:**

v1.0 - April 2026

---

## 1. Overview

MediaLit currently performs file transformation inline inside the API flow. Image conversion and thumbnail generation happen during upload in [`apps/api/src/media/service.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/service.ts) and again in [`apps/api/src/tus/finalize.ts`](/home/rajat/dev/proj/medialit/apps/api/src/tus/finalize.ts). The API then returns a direct file URL, and later `seal` moves the object between temp/private/public locations.

That model is simple, but it creates four scale limits:

1. Upload latency grows with transform time.
2. CPU-heavy work runs inside the main API service.
3. Multipart and TUS each own duplicate processing code.
4. The returned file URL is coupled to the storage object that may later change format or location.

This PRD defines a queue-backed processing pipeline that:

- Accepts uploads through the existing MediaLit API surface
- Defers transforms until the media object is sealed
- Runs conversion inside isolated Docker containers, outside the API app
- Preserves a stable user-facing delivery URL even when the underlying object changes
- Scales across many concurrent jobs with retries, observability, and backpressure
- Remains portable across S3-compatible storage providers instead of depending on vendor-native media pipelines

---

## 2. Problem Statement

### Current behavior

Today MediaLit does the following:

1. Receives multipart upload at `POST /media/create` or finalizes a TUS upload.
2. Writes the file to local temp disk.
3. Optionally converts JPEG/PNG to WebP based on media settings.
4. Optionally generates a thumbnail.
5. Uploads the transformed main file to the private bucket.
6. Creates a `Media` record with `temp: true`.
7. Returns media details including a signed or public file URL.
8. On `POST /media/seal/:mediaId`, moves or copies the object to its final location.

### Why this is not enough

- Large video transcodes will block request-response time and tie up API workers.
- A single bad file can consume memory, CPU, disk, and ffmpeg time inside the app container.
- Using local temp disk inside the API makes horizontal scaling harder and increases operational risk.
- Returning direct object URLs means "replace original with converted output" becomes fragile when:
    - the extension changes (`.png` to `.avif`)
    - the object moves from temp/private to public
    - the "main" file is re-authored by a background job
- At scale, file processing needs durable queueing, retry isolation, idempotent commits, and explicit job states.

---

## 3. Goals

1. Decouple upload ingestion from transformation, with sealing as the boundary between the two.
2. Run transforms in isolated Docker sandboxes on dedicated worker infrastructure.
3. Support account-level defaults and per-upload overrides for transforms.
4. Preserve MediaLit's current concepts of temp upload, access control, and sealing.
5. Provide a stable delivery URL that does not break when the active file format changes.
6. Support both multipart and TUS uploads through one shared processing pipeline.
7. Make processing observable, retryable, and safe under high concurrency.
8. Keep the architecture self-hostable and vendor-agnostic across AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO, and similar S3-compatible systems.

---

## 4. Non-Goals

- Real-time live streaming pipelines
- Arbitrary user-supplied code execution inside the runner
- On-demand image resizing on every request
- DRM, HLS packaging, or adaptive bitrate video in v1
- Cross-region active-active processing in v1

---

## 5. Design Principles

1. **Source is immutable**: the uploaded original is never overwritten in place.
2. **Delivery is logical**: user-facing URLs point to a logical asset, not a storage object key.
3. **Commit is atomic**: a job only becomes user-visible after outputs are fully uploaded and validated.
4. **API stays thin**: the API authenticates, records intent, stores source objects, and publishes jobs on seal; it does not transcode.
5. **Workers are disposable**: each processing run happens in an isolated container that can be killed and retried safely.
6. **State is explicit**: upload, processing, sealing, readiness, and failure all have first-class states.
7. **Portability over cleverness**: prefer primitives MediaLit can run anywhere over provider-specific shortcuts.
8. **Self-hostable by default**: the reference architecture must work on an operator-managed stack, not only on a managed cloud.
9. **Seal is the processing trigger**: uploads remain source-only until the user finalizes the object.

---

## 6. Product Alignment Constraints

Because MediaLit is an OSS, self-hostable, vendor-agnostic DAM, this architecture must respect the following boundaries:

1. **No storage-vendor lock-in**:

    - Do not require AWS Lambda, S3 Event Notifications, MediaConvert, CloudFront Functions, Cloudflare Images, R2-specific features, or equivalent proprietary services in the core design.

2. **S3-compatible object storage is the system of record**:

    - Originals, renditions, and staging artifacts should be stored using ordinary object operations such as put, get, list, copy, and delete.

3. **MediaLit owns transformation semantics**:

    - Format conversion, transform selection, sealing rules, and delivery resolution should live in MediaLit metadata and services, not in provider-specific storage rules.

4. **Self-hosted operators need a low-complexity path**:

    - The design should support a single-node deployment where API, queue, MongoDB, Redis, and worker run under operator control, while also scaling to multi-node setups later.

5. **Provider differences must be tolerated explicitly**:
    - The design cannot assume bucket policies, object ACLs, eventing, object versioning, or CDN capabilities that are missing on some S3-compatible providers.

---

## 7. User Stories

### Developer

- As a developer, I upload a file and immediately receive a `mediaId` plus a delivery URL that remains valid even after processing completes.
- As a developer, I can request transforms such as `webp`, `avif`, `webm`, or a named preset that expands into those transforms.
- As a developer, I can poll or subscribe to processing status after I seal the object.

### MediaLit operator

- As an operator, I can scale processing workers separately from API servers.
- As an operator, I can cap runner CPU, memory, disk, runtime, and network access.
- As an operator, I can retry failed jobs without duplicating published outputs.

### End user

- As an end user, I can access the uploaded asset using one URL once it is ready.
- As an end user, I do not see half-written or failed conversions.

---

## 8. Current-State Constraints from the Existing API

The new design must account for these current behaviors:

- [`apps/api/src/media/handlers.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/handlers.ts) returns full media details immediately after upload.
- [`apps/api/src/media/service.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/service.ts) derives the returned file URL from `temp` and `accessControl`.
- [`apps/api/src/media/queries.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/queries.ts) excludes temp records from list/count endpoints.
- [`apps/api/src/media/cleanup.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/cleanup.ts) deletes expired temp uploads.
- [`apps/api/src/tus/finalize.ts`](/home/rajat/dev/proj/medialit/apps/api/src/tus/finalize.ts) duplicates the multipart transformation flow.
- [`packages/models/src/media.ts`](/home/rajat/dev/proj/medialit/packages/models/src/media.ts) and [`packages/models/src/media-schema.ts`](/home/rajat/dev/proj/medialit/packages/models/src/media-schema.ts) do not yet model processing state, job state, or active rendition pointers.

This means v1 of the new pipeline must either:

- preserve the current response shape while adding new fields, or
- introduce versioned endpoints/SDK responses

This PRD recommends preserving the current response shape and adding new fields.

---

## 9. Proposed High-Level Architecture

### Components

1. **Upload API**

    - Authenticates request
    - Persists initial media record
    - Stores uploaded original in object storage
    - Captures transform intent but does not enqueue processing jobs yet

2. **Seal Coordinator**

    - Evaluates transform settings when `seal` is called
    - Decides whether sealing is immediate or requires background processing
    - Enqueues a processing job only for sealed objects

3. **Job Queue**

    - Durable queue for processing work
    - Stores retry and backoff semantics
    - Supports delayed and dead-letter states

4. **Runner Orchestrator**

    - Consumes queued jobs
    - Creates one isolated Docker container per job
    - Mounts a short-lived working directory
    - Streams logs and updates heartbeat/state

5. **Processing Runner Container**

    - Downloads source file
    - Performs transform with ffmpeg/sharp/libvips/cwebp/etc.
    - Produces a manifest describing outputs
    - Uploads outputs to staging object paths

6. **Committer**

    - Validates outputs
    - Updates DB pointers to the new active rendition
    - Completes the pending seal according to access control and lifecycle state

7. **Delivery Layer**
    - Resolves a stable delivery URL to the current active rendition
    - Issues redirect or signed redirect for private assets

### Recommended deployment model

- API and web app run separately from processing nodes.
- Processing nodes run a lightweight orchestrator with Docker access.
- API publishes seal-triggered jobs to a shared queue and never talks to the Docker daemon directly.
- Object storage remains any S3-compatible backend already supported by MediaLit.
- Runner containers run with:
    - `--network none` by default
    - read-only root filesystem
    - bounded CPU and memory
    - bounded ephemeral disk
    - dropped Linux capabilities
    - no shared host mounts except the job workdir

For larger scale, the same contract should later map to Kubernetes Jobs, ECS tasks, or Nomad allocations without changing the API or DB model.

### OSS-first reference topology

The reference deployment for this PRD should assume:

- MongoDB for metadata
- Redis for queue transport
- Docker for job isolation
- one or two S3-compatible buckets for storage
- optional CDN in front of public delivery

This keeps the baseline deployable by the MediaLit community without requiring a specific cloud control plane.

---

## 10. Recommended Storage Model

### Key idea

Do not overwrite the uploaded object in place. Instead:

1. Keep the original file as an immutable source object.
2. Write transformed outputs as separate derived objects.
3. Mark one rendition as the active delivery target.

### Why this is the right replacement strategy

Directly replacing the original storage object is risky because:

- object updates are not atomic with DB updates
- extension and MIME type changes break existing direct URLs
- old signed URLs may point to the wrong file
- rollback is hard if the converted output is corrupted
- background retries can race with reads and deletes

### Recommended object layout

The exact prefix can follow the dual-bucket design, but the logical layout should become:

```text
private/
  source/{mediaId}/{versionId}/original.{ext}
  staging/{jobId}/...
  temp/{mediaId}/...                  # only for unfinished temp uploads if needed

public/
  renditions/{mediaId}/{versionId}/main.avif
  renditions/{mediaId}/{versionId}/main.webp
  renditions/{mediaId}/{versionId}/main.webm
  renditions/{mediaId}/{versionId}/thumb.webp
```

Notes:

- `versionId` is an immutable version marker, not the media ID.
- `jobId` staging paths are never user-visible.
- Source and derived outputs can live in private or public buckets depending on lifecycle stage, but the logical separation must remain.
- The storage scheme intentionally uses plain object paths and metadata that work across AWS S3, Cloudflare R2, MinIO, and similar providers.

### Provider-agnostic storage rules

- Do not require object ACL mutation during processing.
- Do not require provider-managed rendition services.
- Do not rely on bucket event notifications for job dispatch.
- Do not rely on object versioning as the application version model.
- Treat CDN integration as optional acceleration, not a correctness dependency.

---

## 11. URL Strategy and Recommendation

### Decision to make

We need to decide how MediaLit "hands over" the file URL to the user while still allowing background conversion to replace the main deliverable.

### Recommended decision

**Adopt a stable delivery URL per `mediaId`, and stop treating the object-storage URL as the public contract.**

Example:

```text
https://cdn.medialit.cloud/m/{mediaId}
https://api.medialit.cloud/media/file/{mediaId}?token=...
```

### How it works

1. The API returns `mediaId` and `file` as a stable delivery URL.
2. Before seal:
    - the delivery URL resolves to the uploaded source object
3. After seal is requested and processing is pending:
    - the delivery URL may continue resolving to the uploaded source object, or
    - returns `425 Too Early` / `409 Processing` if the product chooses "ready-only" delivery
4. After seal-driven processing completes:
    - the same delivery URL resolves to the active transformed rendition
5. If a new transform version is generated later:
    - the delivery URL still does not change

### Recommendation for MediaLit v1

For compatibility with current behavior, the delivery URL should resolve to the source object before and during seal-time processing, and later switch to the transformed rendition. This preserves the current "usable URL right after upload" experience while making sealing the trigger for background work.

### Why this is better than returning direct object URLs

- URL handed to the user stays stable
- extension changes do not leak into the contract
- cutover becomes a DB or manifest pointer update
- rollback becomes pointer reversal
- CDN and app logic can be cached independently from storage layout

### Delivery implementation options

#### Option A: API redirect endpoint

- `GET /media/file/:mediaId`
- API checks current active rendition and responds with a signed redirect or public redirect
- Easiest to ship first
- Higher origin load unless cached aggressively

#### Option B: CDN worker + manifest lookup

- CDN path is stable
- Edge worker reads cached manifest for `mediaId`
- Best long-term delivery performance
- More complex to ship

### PRD recommendation

Ship **Option A** first, but design metadata so we can later move to **Option B** without changing the API response contract.

This keeps delivery logic inside MediaLit rather than coupling it to one provider's CDN or object URL format.

---

## 12. Functional Requirements

### 12.1 Upload intake

- Support existing multipart upload endpoint.
- Support existing TUS flow.
- Accept transform instructions from:
    - account or API key settings
    - upload request overrides
    - future named presets that expand into transform lists
- Store source object immediately after upload completion.
- Create a temp media record without kicking off transformation.
- Ensure the same intake behavior works whether the backing storage is S3, R2, MinIO, or another compatible provider.
- Persist `transforms` intent needed later at seal time.

### 12.2 Processing rules

- Determine if a file should be transformed based on:
    - MIME type
    - file extension
    - requested `transforms`
    - account defaults
    - per-upload overrides
- Resolve `eagerTransforms` when `seal` is called, not during upload.
- Support examples such as:
    - JPEG/PNG to AVIF and/or WebP
    - video to WebM
    - thumbnail extraction for image/video
- Reject unsupported transforms before queueing where possible at seal time.

### 12.3 Job queueing

- Every seal-triggered processing request must create a durable job record.
- Upload alone must not enqueue a processing job.
- Jobs must support states:
    - `queued`
    - `claimed`
    - `running`
    - `uploading_outputs`
    - `committing`
    - `completed`
    - `failed`
    - `dead_letter`
    - `cancelled`
- Jobs must be idempotent by `(mediaId, eagerTransforms, sourceVersionId)`.

### 12.4 Sandbox execution

- Each job runs in an isolated Docker container.
- Default container network access is disabled.
- Only the minimal runtime and codecs needed by the runner image are present.
- Per-job resource limits are configurable.
- Job execution timeout is enforced at orchestrator level.
- The runner must access storage through MediaLit's portable S3 client layer, not through vendor-specific SDK features outside the S3-compatible surface.

### 12.5 Output validation

- Validate output MIME type, extension, file size, and checksum.
- Validate that thumbnails and main outputs exist before commit.
- Validate that the runner manifest matches the requested `eagerTransforms`.

### 12.6 Publish and seal

- If the media is temp and unsealed, no processing job should exist.
- When `seal` is called:
    - resolve `eagerTransforms` from the stored/requested `transforms`
    - evaluate whether any transform work is required
    - if required, record `sealRequestedAt`, enqueue the job, and keep the object non-final until processing succeeds
    - if not required, finalize sealing immediately
- Repeated `seal` calls while a seal-driven job is running must be idempotent.
- For public media, sealing publishes the final active rendition to public delivery.
- For private media, sealing preserves signed delivery semantics.
- Public/private resolution must continue to work on providers that do not support bucket policies in the same way as AWS.

### 12.7 Deletion

- Delete should tombstone the media first.
- Active job must be cancelled if still running.
- Source, staging, and rendition objects must be garbage-collected safely.

---

## 13. Data Model Changes

### 13.1 Extend `Media`

Recommended additions to the existing `Media` model:

- `processingStatus`: `none | queued | processing | ready | failed`
- `lifecycleStatus`: `temp | seal_requested | sealed | deleting | deleted`
- `sourceVersionId`
- `activeVersionId`
- `activeRenditionId`
- `deliveryMode`: `source | transformed`
- `transforms`
- `eagerTransforms`
- `processingRequestedAt`
- `processingCompletedAt`
- `processingFailedAt`
- `processingErrorCode`
- `processingErrorMessage`
- `sealRequestedAt`

### 13.2 New collection: `MediaProcessingJob`

Fields:

- `jobId`
- `mediaId`
- `userId`
- `apikey`
- `sourceVersionId`
- `eagerTransforms`
- `status`
- `attempt`
- `maxAttempts`
- `priority`
- `leaseOwner`
- `leaseExpiresAt`
- `runnerImage`
- `resourceLimits`
- `createdAt`
- `startedAt`
- `finishedAt`
- `failureCode`
- `failureMessage`
- `runnerLogsRef`
- `outputManifest`

### 13.3 New collection: `MediaRendition`

Fields:

- `renditionId`
- `mediaId`
- `versionId`
- `kind`: `source | primary | thumbnail | alternate`
- `mimeType`
- `extension`
- `bucket`
- `objectKey`
- `size`
- `checksum`
- `width`
- `height`
- `duration`
- `bitrate`
- `codec`
- `isActive`
- `createdByJobId`

### Why separate collections are recommended

- Jobs grow operational metadata quickly.
- Renditions are a one-to-many relation and should not bloat the top-level media document.
- This keeps the API-facing `Media` document readable and indexable.
- `MediaRendition` is the industry-standard concept here: it is simply the inventory of actual generated outputs for an asset.

---

## 14. API Contract Changes

### 14.1 `POST /media/create`

Keep endpoint, but evolve response to include:

- existing fields:
    - `mediaId`
    - `file`
    - `thumbnail`
    - `access`
    - `mimeType`
    - `size`
- new fields:
    - `processingStatus`
    - `lifecycleStatus`
    - `transforms`
    - `eagerTransforms`
    - `isProcessing`
    - `isReady`

Recommended behavior:

- `file` returns the stable delivery URL, not the raw storage URL.
- `thumbnail` may be empty until available.
- `processingStatus` should be `none` immediately after upload and before seal.

### 14.2 `POST /media/get/:mediaId`

Return the same fields as upload response and always reflect current status.

### 14.3 `POST /media/seal/:mediaId`

Behavior changes:

- If no processing is required, seal immediately.
- If processing is required, set `lifecycleStatus: "seal_requested"` and `processingStatus: "queued"`, then let the committer finish seal after processing.
- If a seal-driven job is already in progress, return the current pending state idempotently.

### 14.4 New endpoint: `GET /media/file/:mediaId`

Responsibilities:

- Resolve delivery URL to source or active rendition
- Enforce signed access for private assets
- Redirect to object storage/CDN target

### 14.5 Optional future endpoints

- `GET /media/jobs/:jobId`
- `POST /media/reprocess/:mediaId`
- `POST /media/cancel/:mediaId`

---

## 15. Settings, Transforms, and Eager Transforms

The current media settings model only supports `useWebP`, `webpOutputQuality`, and thumbnail dimensions in [`apps/api/src/media-settings/model.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media-settings/model.ts).

That is too narrow for a queue-based pipeline. Replace or extend it with explicit `transforms`, optional named presets, and resolved `eagerTransforms`.

### Recommended model

- `transforms`
    - requested intent stored on the asset
    - may come from upload request, API key defaults, or a named preset
- `eagerTransforms`
    - the concrete transform plan MediaLit resolves and executes on seal
    - should be normalized before queueing so job execution is deterministic
- `renditions`
    - the actual generated outputs that exist after processing

### Proposed preset examples

- `none`
- `image-webp`
- `image-avif-webp`
- `video-webm`
- `video-webm-thumb`
- `passthrough-with-thumb`

### Example structure

```json
{
    "transforms": {
        "image": ["avif", "webp"],
        "thumbnail": true
    },
    "eagerTransforms": {
        "onSeal": ["avif", "webp", "thumb"]
    }
}
```

### Precedence

1. Upload request `transforms`
2. API key or account defaults
3. System default

This keeps transformation behavior as part of MediaLit's API contract instead of leaking storage-provider-specific optimization behavior into user code.

Named presets may be chosen at upload time, but they should resolve into `transforms`, and only `eagerTransforms` are executed once the media is sealed.

---

## 16. Processing Lifecycle

### State machine

```text
uploaded_temp
  -> seal_requested
  -> queued
  -> processing
  -> committing
  -> sealed

uploaded_temp
  -> seal_requested
  -> sealed

uploaded_temp
  -> seal_requested
  -> queued
  -> processing
  -> failed
```

### Detailed flow

1. Client uploads file.
2. API stores source object and creates `Media` record.
3. API returns `mediaId`, stable delivery URL, and `processingStatus: none`.
4. Client calls `seal`.
5. API resolves `eagerTransforms` from the stored/requested `transforms` and decides whether background processing is required.
6. If processing is required, API records `sealRequestedAt` and enqueues a job.
7. Orchestrator claims job and launches runner container.
8. Runner downloads source and writes outputs to staging.
9. Runner uploads manifest and outputs.
10. Committer validates outputs, creates rendition records, and switches `activeRenditionId`.
11. Committer completes sealing.
12. Delivery URL begins resolving to the new active rendition.

---

## 17. Queue and Orchestration Recommendation

### Recommended v1 choice

- **Queue**: BullMQ on Redis, because it is straightforward in the current Node.js stack
- **Durable job record**: MongoDB collection remains source of truth for audit and recovery

### Why this is a pragmatic choice

- Minimal implementation friction in this repo
- Good retry/backoff support
- Easy job priorities and concurrency controls
- Fits self-hosted deployments better than forcing AWS-native queue infra

### Scale path

If job volume grows substantially, keep the job contract but allow the queue adapter to evolve to SQS or RabbitMQ. The PRD does not require that change for v1.

The important architectural point is that queueing is an internal MediaLit concern and must remain swappable. Storage portability is a core product value, so the processing system should not quietly reintroduce cloud lock-in through the job layer.

### Orchestrator responsibilities

- claim job lease
- prepare job workspace
- run `docker run --rm ...`
- stream stdout/stderr
- enforce timeout
- upload logs if job fails
- reconcile abandoned jobs after orchestrator crash

---

## 18. Security and Isolation Requirements

1. API service must not have Docker socket access.
2. Runner host must be a separate trust boundary from public API nodes.
3. Containers run with:
    - no inbound ports
    - no shared host network
    - no privileged mode
    - restricted syscalls where feasible
    - bounded filesystem
4. Only signed, short-lived object access is provided to the runner.
5. Runner image must be versioned and pinned.
6. Unsupported or dangerous file types can be rejected before processing.
7. Credentials exposed to workers should be scoped to object operations MediaLit already supports generically across S3-compatible providers.

---

## 19. Reliability Requirements

### Idempotency

- Re-delivered queue messages must not publish duplicate active renditions.
- Commit step must be idempotent using `sourceVersionId + eagerTransforms`.

### Retries

- Retry transient failures such as container startup failure, network blips to storage, or temporary disk pressure.
- Do not retry deterministic failures forever, such as unsupported codec or corrupt input.

### Heartbeats

- Running jobs must heartbeat every N seconds.
- Orchestrator can reclaim jobs whose lease expired.

### Dead-letter

- After max attempts, move job to dead-letter status and expose failure reason through API.

---

## 20. Performance and Scale Targets

Initial targets for v1:

- 95th percentile upload API latency remains near current storage-write time, not transform time
- 95th percentile seal latency for "job queued" acknowledgement remains short even for large files
- horizontal worker scaling independent from API nodes
- at least hundreds of queued jobs without API degradation
- configurable per-node job concurrency
- no unbounded local disk growth on API nodes

Suggested operational defaults:

- separate queues for `image` and `video`
- lower concurrency for video jobs
- weighted scheduling so small image jobs are not starved by long transcodes

The design should scale down as well as up:

- a small self-hosted install should be able to run one worker process and one queue instance
- a larger install should be able to shard workers by transform class or media type without changing the API contract

---

## 21. Observability Requirements

Track at minimum:

- jobs queued, running, completed, failed, dead-lettered
- queue depth by transform class and media type
- container runtime duration
- storage download/upload bytes
- runner exit code
- output validation failures
- seal-after-processing completion rate
- delivery resolution errors

Required logs:

- `mediaId`
- `jobId`
- `sourceVersionId`
- `eagerTransforms`
- `attempt`
- `runnerImage`

Required alerts:

- queue backlog above threshold
- high failure rate by transform class
- repeated heartbeat expirations
- container launch failures

---

## 22. Cleanup and Retention

### Keep

- source object for rollback and audit
- active rendition
- latest successful thumbnail

### Delete or age out

- staging objects by `jobId`
- failed partial outputs
- old inactive renditions after retention window
- expired temp media that are neither sealed nor active

### Recommendation

Keep source objects for at least a configurable retention period, not zero. Do not immediately delete the original upon successful conversion.

---

## 23. Migration Plan

### Phase 1: Data model and stable delivery URL

- extend `Media`
- add job and rendition collections
- add `GET /media/file/:mediaId`
- return stable delivery URL in `file`

### Phase 2: Shared async processing path

- extract current inline transformation logic into a reusable runner package or container entrypoint
- change multipart and TUS finalize to store source only and defer queueing until `seal`
- keep the storage adapter and object layout compatible with existing dual-bucket, provider-agnostic MediaLit deployments

### Phase 3: Seal integration

- make `seal` the trigger that resolves `eagerTransforms` from `transforms` and enqueues jobs
- move listing logic from `temp` only to lifecycle-aware filtering

### Phase 4: Scale hardening

- split image/video queues
- add dead-letter handling
- add dashboard metrics
- add runner autoscaling

### Backward-compatibility note

Existing clients that assume `file` is a direct object-storage URL may notice different redirect semantics. That is acceptable if the URL remains fetchable. Document this change clearly in the SDK and API docs.

---

## 24. Risks

1. **Delivery URL indirection adds latency**

    - Mitigation: redirect responses, caching, eventual CDN worker

2. **Docker-based processing can become an operational bottleneck**

    - Mitigation: dedicated worker nodes, queue limits, scale-out runners

3. **Media model growth can become messy if job state is embedded directly**

    - Mitigation: keep jobs and renditions as separate collections

4. **Temp and seal semantics can become confusing**

    - Mitigation: separate `processingStatus` from `lifecycleStatus`

5. **Runner image drift can cause inconsistent outputs**

    - Mitigation: versioned runner image and manifest schema

6. **Architecture accidentally becomes cloud-specific over time**
    - Mitigation: enforce that new pipeline features are built on MediaLit's generic storage and delivery abstractions first

---

## 25. Alternatives Considered

### Alternative A: Keep synchronous conversion in API

Rejected because it does not isolate CPU-heavy work and will not scale for long video transforms.

### Alternative B: Overwrite the original object key after processing

Rejected because it breaks URL stability, complicates rollback, and makes state transitions racy.

### Alternative C: Store only transformed output and discard original immediately

Rejected because it prevents rollback, limits future reprocessing, and makes failures harder to recover from.

### Alternative D: Run one long-lived shared conversion service instead of one container per job

Rejected for v1 because fault isolation and sandboxing are weaker.

### Alternative E: Use provider-native processing products

Rejected for the core design because MediaLit's value is to give developers one OSS DAM that can sit on top of many S3-compatible backends.

---

## 26. Recommended Final Decision

MediaLit should implement a queue-backed file processing pipeline where:

- uploads persist an immutable source object first
- processing is queued only when `seal` is called and executed outside the API in isolated Docker containers
- transformed outputs are published as separate renditions
- the system "replaces" the original by switching the active rendition pointer, not by overwriting storage
- clients receive a stable delivery URL tied to `mediaId`
- multipart and TUS share the same background processing path
- the core flow continues to work across self-hosted, S3-compatible environments without depending on vendor-native media services

This is the cleanest way to support async conversion, container isolation, stable URLs, and future scale without fighting the current API model.

---

## 27. Implementation Notes for This Repo

The following files are the main touchpoints for implementation after this PRD:

- [`apps/api/src/media/service.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/service.ts)
- [`apps/api/src/tus/finalize.ts`](/home/rajat/dev/proj/medialit/apps/api/src/tus/finalize.ts)
- [`apps/api/src/media/handlers.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/handlers.ts)
- [`apps/api/src/media/routes.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/routes.ts)
- [`apps/api/src/media/cleanup.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media/cleanup.ts)
- [`apps/api/src/media-settings/model.ts`](/home/rajat/dev/proj/medialit/apps/api/src/media-settings/model.ts)
- [`packages/models/src/media.ts`](/home/rajat/dev/proj/medialit/packages/models/src/media.ts)
- [`packages/models/src/media-schema.ts`](/home/rajat/dev/proj/medialit/packages/models/src/media-schema.ts)
- [`packages/medialit/src/index.ts`](/home/rajat/dev/proj/medialit/packages/medialit/src/index.ts)

Recommended new areas:

- `apps/api/src/media-processing/`
- `apps/api/src/media-delivery/`
- `packages/models/src/media-processing-job-schema.ts`
- `packages/models/src/media-rendition-schema.ts`
- `apps/runner/` or a separate worker package for the Docker job entrypoint
