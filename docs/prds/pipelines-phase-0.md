# Pipelines phase 0: jobs, derivatives and webhooks

**Issue:** #257 (part of #247). Sub-issues: #160 (jobs), #261 (derivatives and status), #262 (WebP and thumbnails), #198 (webhooks).

**Status:** Ready for development. The decisions are recorded in section 12.

## 1. Goal

Build the system that every pipeline feature runs on: a Postgres job queue, a worker process, derivatives with a processing status, and webhooks. Users get no new features.

Processing runs only for media that is sealed, so compute is spent only on files that are kept. Steps that change the original file (WebP) run inside the seal request. Steps that create derivatives (posters, HLS, captions from phase 1 on) run as jobs after seal.

## 2. What exists today

- `finalizeStoredUpload` (`apps/api/src/media/ingest.ts`) runs inside the upload request for form-data, tus and MCP. For images with `useWebP` on, it converts the file and replaces `main.{ext}` with `main.webp`. It then makes `thumb.webp` (images from a local copy, videos from a presigned URL) and marks the media row uploaded.
- Media starts as **temp** in the private bucket. `sealMedia` copies `main.*` (only for public media) and `thumb.webp` (always) to the public bucket and clears `temp`. Temp media that isn't sealed is deleted after `TEMP_MEDIA_EXPIRATION_HOURS` (24 hours by default).
- **Every client that keeps a file seals it:** the CLI (`medialit upload` seals unless `--temp` is passed), the dashboard, the CourseLit backend, and MCP (`seal_media`). Media that is never sealed is never kept.
- `removeStoredFiles` deletes `main.*` and `thumb.webp` by key. The cleanup jobs delete the whole `{mediaId}/` folder.
- Background work runs on `setInterval` in the API process: tus cleanup, temp expiry, stale uploads, and billing maintenance.
- `thumbnailWidth` and `thumbnailHeight` are stored but never used (#256).
- QA and prod run one API replica each.

**What clients depend on.** CourseLit saves `file` and `thumbnail` from the upload response in its page layouts. When it publishes a page, it seals each media item **one at a time** and replaces only the URLs already in the layout that end in `main.*` or `thumb.*` with the URLs from the seal response (`replace-temp-media-with-sealed-media-in-page-layout.ts`). If a seal fails, `safeSealMedia` logs the error and moves on. It follows that:

1. **The seal response sets the lasting URL.** For public media, the `file` URL in the seal response is saved for good. The main file must not move after seal answers.
2. **The thumbnail has to be in the upload response.** If it isn't, CourseLit has no `thumb.*` URL to replace at seal, and it never gets a thumbnail.
3. **Seal must not fail because of processing.** A failed seal leaves the media temp, and it is deleted after 24 hours. Seal must not depend on workers being up.
4. **Seal latency adds up.** Every millisecond added to seal is multiplied by the number of media items on the page being published.

## 3. Decisions

### D1. The queue is a Drizzle-managed `jobs` table, claimed with `FOR UPDATE SKIP LOCKED`

We build it ourselves instead of using pg-boss or graphile-worker. Reasons:

- **Jobs are queued in the same transaction as the domain change.** Sealing, writing derivative rows and queueing jobs happen in one transaction. That rules out "media sealed but job lost" and "job queued for a seal that rolled back".
- **Long jobs need leases with heartbeats.** HLS encodes in phase 1 can run for most of an hour. A fixed visibility timeout either requeues a healthy job or leaves a dead one stuck for an hour. A lease that the worker renews, and that lapses quickly when the worker dies, handles both cases.
- **Deleting media cancels its jobs.** `jobs.media_id` cascades on delete. A worker's heartbeat finds the row gone and aborts the handler, which kills ffmpeg.
- **One schema and one migration tool.** pg-boss and graphile-worker each keep their own schema and run their own migrations next to Drizzle's.

The queue code knows nothing about media: job types, handlers and payloads are registered from outside it, so it could later move to `@codelitdev/platform`. This is roughly 400 lines plus tests.

Alternatives we rejected:
- **pg-boss:** it would lose heartbeats and cancellation by cascade.
- **BullMQ on Redis, as SendLit uses:** the rule against a second data store in AGENTS.md rules it out, and it would mean one more service for every self-hosted install. SendLit also runs its workers inside the API process, which is fine for sending email but not for video encoding.

We do follow one SendLit pattern: a job carries row IDs, and its state lives in Postgres rows.

### D2. Workers are a second entrypoint in the API image

- `apps/api/src/worker.ts` starts the job runner. It uses the same package, image, database and S3 code. In Docker, `CMD ["bun", "apps/api/src/worker.ts"]` overrides the default command.
- The worker serves `/health` and `/ready` on `WORKER_PORT` for Kubernetes probes, using the same `@codelitdev/platform` lifecycle helpers as the API.
- There is no option to run jobs inside the API process. Self-hosted installs get one more Compose service.

### D3. Where each kind of step runs

| Kind of step | Runs | Examples | Why |
|---|---|---|---|
| Thumbnail for the upload response | Inline, at upload | `thumb.webp` | Clients save it from the upload response (section 2, point 2) |
| Changes the original file | Inline, inside seal | WebP | The seal response sets the lasting URL, and seal can't depend on workers (points 1 and 3) |
| Creates a derivative | Job, queued by seal | Poster, metadata, HLS, MP4, captions (phase 1+) | Heavy, and the original stays usable while it runs |

- Nothing but the thumbnail runs for temp media. Temp media that expires is never processed.
- Seal reads the app's media settings and applies them: it converts inline and queues jobs. Changing a setting affects media sealed afterwards. The settings in effect at **seal** apply, not the ones at upload. These are at most 24 hours apart.
- Sealing media that is already sealed does nothing (seal is idempotent today and stays so).

### D4. Thumbnails stay at upload

Thumbnails stay inline in `finalizeStoredUpload`, as today, with the #256 resize and crop to `thumbnailWidth`×`thumbnailHeight`. Image thumbnails are made from the local copy, and video thumbnails from a presigned URL, reading only the first frames. They cost a few hundred milliseconds for uploads that are never sealed. Avoiding that cost would break thumbnails in CourseLit, SendLit and FrontLit.

The better video poster in #265 (skipping black frames) is a derivative. It runs after seal as a job and replaces `thumb.webp`, so the heavier work still runs only for kept files.

### D5. WebP runs inside the seal request

When `useWebP` is on, the file is an image and it isn't WebP already, `sealMedia` does the following before it answers:

1. **Claim the seal** in a short transaction: `UPDATE media SET seal_claim = <random token>, sealing_until = now() + SEAL_CLAIM_MS WHERE id = ? AND temp AND (sealing_until IS NULL OR sealing_until < now())`. No transaction, row lock or pool connection is held during steps 2–4.
   - If the media is already sealed, return it.
   - If another seal holds an unexpired claim, poll every 250 ms for up to `SEAL_WAIT_MS` (default 15 s), then return the sealed media. If the wait runs out, fail with a retryable error. The first seal still completes, so nothing is lost.
   - `SEAL_CLAIM_MS` (default 120 s) is longer than the slowest conversion plus the copies, so an expired claim means the seal holding it died, and the next seal starts over.
2. Read `main.{ext}`, convert it within the limits below, and write `main.webp` to the private bucket.
3. Check storage against the WebP size.
4. Copy the main file (public media only) and the thumbnail to the public bucket, as today.
5. **Commit** in a second short transaction: lock the row (`SELECT … FOR UPDATE`) and check that `seal_claim` is still this seal's token. If the row is gone (deleted meanwhile) or the claim was lost, delete what this seal wrote and fail. Otherwise set `fileName = main.webp`, `mimeType = image/webp`, `size` = the WebP size (#250, decision 3), `temp = false`, and clear `seal_claim` and `sealing_until`. Commit.
6. Delete what the private bucket no longer needs: `main.{ext}` always, and, for public media, also `main.webp`, which now lives in the public bucket. This matches seal today, which deletes the private main file of public media after copying it. Private media keeps only `main.webp` in the private bucket.

Consequences:

- **The seal response, and the public bucket, only ever have `main.webp`.** No URL to the original outlives seal, except signed URLs, which expire.
- **If conversion fails,** seal keeps the original and still succeeds, because a failed seal would get the media deleted (section 2, point 3). The error is logged and returned in `processing.error`. Today, a conversion failure fails the upload.
- **If seal crashes partway,** the original is still there. Once its claim expires, a retried seal converts again and overwrites `main.webp`. A crash after the commit but before step 6 leaves private files behind (`main.{ext}`, and `main.webp` for public media), and they are removed when the media is deleted (deletes remove the whole prefix).
- **Cost:** about 1 s per image, on the API process. The API keeps `cwebp` and `ffmpeg`.
- **Limits.** The conversion parses untrusted images inside the API process that serves every tenant, so it is bounded on bytes, pixels, memory, time and concurrency:
  - Images larger than `WEBP_MAX_INPUT_BYTES` (default 25 MB) are not converted.
  - Images with more than `WEBP_MAX_PIXELS` (default 50 megapixels) are not converted. Width and height are read from the image header without decoding it. A size limit in bytes doesn't stop decompression bombs: a PNG under 25 MB can be 30,000 × 30,000 pixels and need gigabytes to decode.
  - `cwebp` runs under `prlimit --as` set to `WEBP_MAX_MEMORY_MB` (default 1024), so a decoder that runs away is killed instead of the API.
  - A conversion that takes longer than `WEBP_TIMEOUT_MS` (default 30 s) is killed. `cwebp` is spawned without a shell (an argument array, not `shell: true` as `convertToWebp` does today), in its own process group, and the timeout kills the whole group. Killing only a shell would leave `cwebp` running.
  - At most `WEBP_CONCURRENCY` (default 2) conversions run at once per API process. A seal that can't get a slot within `WEBP_QUEUE_WAIT_MS` (default 10 s) seals without converting. Seal never fails because of WebP (see above), so a flood of conversions from one tenant can only cost other tenants their WebP, never their seal or the API.

  In every case, seal keeps the original and records the reason in `processing.error`, as for any other conversion failure.
- **Upload responses for images report the original file, its MIME type and uploaded size.** Today they report the WebP values. The seal response reports the WebP values. This change goes in the changelog (section 12).
- **Media uploaded before the deploy** was already converted by the old code. It is `image/webp` when sealed, so it is skipped.

### D6. Derivatives are written to the private bucket, then published

- Workers always write derivatives to the private bucket, under `{mediaId}/`.
- An idempotent `media.publish` job copies the ready derivatives that aren't public yet to the public bucket, and records it in `derivatives.bucket`. This applies to derivatives of public media, and to thumbnails and posters of all media, as for thumbnails today.
- Seal still copies the main file and the thumbnail itself (D5, step 4), so its response has working public URLs.
- Both seal and the job-finish transaction lock the media row. Either seal sees a ready derivative and publishes it, or the finishing job sees sealed media and queues `media.publish`.

### D7. Processing status lives on `media`

- `media.processing_status` is one of:
  - `pending`: temp media, which isn't processed yet.
  - `processing`: sealed, and jobs are running.
  - `ready`
  - `failed`

  Existing rows are `ready`.
- At seal, the status is `processing` if jobs were queued. Otherwise it is `ready`, or `failed` if WebP failed.
- When a job finishes, the same transaction updates its derivative, locks the media row, and checks whether any job for the media is still `queued` or `running`. If none is, it sets the status (`failed` if any failed, otherwise `ready`) and queues a `webhook.deliver` job for each endpoint of the app (an outbox). The event is therefore queued exactly once, and only if the status change committed.
- Webhooks fire only when the status is changed by a job finishing. A seal that finishes all its work inline answers the caller directly and sends no webhook. **In phase 0 no derivative jobs exist yet, so in practice webhooks start firing in phase 1.** Until then, the "send test event" action (D8) and integration tests with a test job type cover them.
- A failed step never makes the original unavailable.

### D8. Webhooks follow the Standard Webhooks spec

- Each app can have several endpoints (URL, signing secret, enabled flag), managed through REST, MCP, CLI and the dashboard, the same way as media settings.
- There are two events: `media.processing.ready` and `media.processing.failed`. The payload carries IDs and statuses, not URLs, because signed URLs expire. Clients call `GET /media/:id` to get URLs.
- Requests are signed per [Standard Webhooks](https://www.standardwebhooks.com/): `webhook-id`, `webhook-timestamp`, and `webhook-signature` (`v1,` + base64 HMAC-SHA256).
- Each delivery is a `webhook.deliver` job: 10 s timeout, success on any 2xx, and 8 attempts with exponential backoff over about 24 hours. Retries reuse the job's `webhook-id`, so receivers can drop duplicates.
- **SSRF.** The receiving URL is chosen by the tenant, so delivery must not reach anything inside our network:
  - In production, only `https` URLs are accepted.
  - The URL is checked when the endpoint is saved and again on every delivery. At delivery, resolve the hostname, check every resolved address, then connect to the checked address, sending the original hostname for SNI and the `Host` header. Checking one lookup and connecting with another lets the DNS answer change in between (DNS rebinding).
  - Refused addresses: loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local (169.254/16, fe80::/10, which covers cloud metadata), CGNAT (100.64/10), `0.0.0.0/8`, `::`, multicast and reserved ranges, and IPv4-mapped or IPv4-compatible IPv6 forms of all of these. Parse the URL with the WHATWG parser, so decimal, octal and hex IP spellings normalize before the check.
  - Redirects are not followed. A 3xx counts as a failed attempt.
  - Each attempt has a 10 s total deadline (connect, TLS, headers and body together). At most 64 KB of the response is read, and it is discarded. The job stores only the status code, the duration and a generic error class (`timeout`, `connection_failed`, `tls_error`, `blocked_address`), never the response body or the raw socket error.
  - The "send test event" action returns the same generic result: delivered, or failed with a status code or error class. Detailed connection errors would let it be used to map ports on the internal network.
  - `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` turns the address check off for self-hosted installs whose receivers are on the same network. Hosted production never sets it, and the worker logs a warning at startup when it is set.
- The secret is stored as plain text so it can be shown again in the dashboard and rotated.

### D9. Settings are copied onto jobs when seal queues them

Seal copies the settings that apply to a job into its payload or into `derivatives.params`. A job that is retried later still uses the settings in effect at seal.

## 4. Data model

```sql
jobs (
  id            text primary key,
  type          text not null,            -- 'media.publish', 'webhook.deliver'; derivative jobs from phase 1
  payload       jsonb not null,
  media_id      text references media(id) on delete cascade,   -- null for jobs that aren't about one media item
  app_id        text references apps(id) on delete cascade,
  status        text not null,            -- queued | running | succeeded | failed
  priority      int not null default 100,
  run_at        timestamptz not null default now(),
  attempts      int not null default 0,
  max_attempts  int not null,
  locked_by     text,
  locked_until  timestamptz,
  last_error    text,
  dedupe_key    text,                     -- unique while queued or running (partial index)
  created_at, started_at, finished_at timestamptz
)
-- index on (type, status, priority, run_at) where status = 'queued'

derivatives (
  id          text primary key,
  media_id    text not null references media(id) on delete cascade,
  name        text not null,              -- 'thumbnail' now; 'poster', 'hls', 'mp4', 'captions' later
  status      text not null,              -- queued | processing | ready | failed
  bucket      text not null default 'private',
  key         text,                       -- a file, or a prefix ending in '/' for outputs with several files (HLS)
  mime_type   text,
  size        bigint not null default 0,
  params      jsonb not null default '{}',
  error       text,
  created_at, updated_at, completed_at timestamptz,
  unique (media_id, name)
)

media
  + processing_status text not null default 'ready'   -- new uploads insert 'pending'
  + processing_error  text
  + seal_claim        text                -- D5: token of the seal that is converting and copying
  + sealing_until     timestamptz         -- D5: when that claim expires

webhook_endpoints (
  id, app_id → apps on delete cascade, url, secret, enabled, events text[],
  created_at, updated_at
)

workers (
  id            text primary key,         -- e.g. hostname + pid
  classes       text[] not null,
  started_at    timestamptz not null,
  last_seen_at  timestamptz not null      -- updated every 30 s; rows older than 1 day are deleted
)
```

`thumbnailGenerated` stays the source of truth for the `thumbnail` field. A thumbnail also gets a `thumbnail` derivative row, so its status shows next to other derivatives. Existing media isn't backfilled.

There is no separate table for webhook deliveries. The `webhook.deliver` job row holds the attempts, the last error and the response status. Finished jobs are deleted after 7 days, and failed ones after 30.

## 5. The job runner

- **Claiming a job:** one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`. It sets `status = 'running'`, `locked_by`, `locked_until = now() + lease`, and increments `attempts`.
- **Waking up:** the transaction that queues a job runs `pg_notify('jobs', type)`. Workers `LISTEN` for it, and also poll every 5 s in case a notification is missed.
- **Heartbeat:** every `lease / 3`, the worker extends `locked_until` for jobs it still owns. If no row is updated (the job was cancelled or deleted), the handler's `AbortSignal` fires.
- **Reaper:** each worker regularly requeues `running` jobs whose `locked_until` has passed, or marks them `failed` once they have used all their attempts.
- **Retries:** exponential backoff with jitter. Each handler returns success, a retryable error, or a permanent error. Bad input and insufficient storage are permanent.
- **Concurrency:** each job type has a class. The `cpu` class (ffmpeg, libvips) defaults to the number of CPU cores, and the `io` class (webhooks, publishing) defaults to 16. Both can be set with `WORKER_CONCURRENCY_CPU` and `WORKER_CONCURRENCY_IO`. A worker can be limited to some classes with `WORKER_CLASSES`.
- **Defaults:**

  | Setting | Default |
  |---|---|
  | Lease | 60 s |
  | Heartbeat | every 20 s |
  | Reaper | runs every 30 s |
  | Retry backoff | starts at 30 s, doubles, capped at 1 h, with jitter |

  | Job type | Max attempts |
  |---|---|
  | Derivative jobs | 3 |
  | `media.publish` | 5 |
  | `webhook.deliver` | 8 (about 24 h) |
  | Periodic cleanup | 1 (the next run tries again) |

  These are constants in code, not environment variables, until someone needs to change them.
- **Liveness:** each worker updates its `workers` row every 30 s. The API logs a warning at startup, and then every hour, if no worker has been seen in the last 5 minutes. A missing worker means no cleanup and no derivatives. The warning names the missing Compose service. On hosted, the API also pages operators (`jobs_no_worker`, section 9).
- **Shutdown:** the worker stops claiming jobs, waits up to `WORKER_SHUTDOWN_GRACE_MS` for running jobs to finish, then releases their leases so another worker picks them up.
- **Periodic tasks:** tus cleanup, temp expiry and stale-upload cleanup move from the API's timers to scheduled jobs in the worker, with a `dedupe_key`. They then run once per cluster instead of once per API replica, and they give the worker real work in phase 0.

## 6. Flows

**Upload (form-data, tus, MCP)**

1. Store the file. The upload request no longer converts it to WebP.
2. Make the thumbnail inline (D4), with the #256 resize and crop.
3. Complete the media row with the original file, the uploaded size and `processing_status = 'pending'`. Respond with the same shape as today.

**Seal:** D5 (WebP, the storage check and copying to the public bucket), then, in the commit transaction (D5, step 5), insert derivative rows and queue their jobs (from phase 1 on), and set `processing_status`.

**A job finishes:** upload its output to the private bucket. Then, in one transaction: lock the media row (if it's gone, delete the output and stop), check storage, mark the derivative ready or failed, update the media status, queue the webhook jobs, and queue `media.publish` if something new needs to be public.

**Delete and temp expiry:** delete the whole `{mediaId}/` prefix in both buckets (`removeStoredFiles` currently deletes known keys only). The database cascades to derivatives and jobs. A job that is still running finds out on its next heartbeat, or when its finishing transaction finds no media row, and deletes what it wrote.

**Storage:** before seal, the media counts with its uploaded size. After seal, it counts with the WebP size. `getTotalSpace` also adds up the `size` of ready derivatives. A derivative that would go over the account's storage limit fails with `not_enough_storage`, and its files are deleted.

## 7. API surface

These changes only add fields. No existing field is renamed or removed.

- The media response (REST, MCP and CLI; the `media` header for tus; `@medialit/models`) gains:
  - `processing: { status, error? }`
  - `derivatives: { [name]: { status, url?, mimeType?, size?, error? } }`

  `url` is set only when the derivative is ready, and follows the media's access control, like `file`. Derivatives still in progress are listed with their status.
- Upload responses for images with WebP on now report the original file, MIME type and size. The seal response reports the WebP values (D5).
- Webhook endpoints follow the media settings routes, which are mounted at `/settings/media` and use `POST` for every action (`/create`, `/get`). The new routes are mounted at `/settings/webhooks`:

  | Route | Action |
  |---|---|
  | `POST /settings/webhooks/create` | Add an endpoint. Returns its secret. |
  | `POST /settings/webhooks/get` | List the app's endpoints. |
  | `POST /settings/webhooks/update` | Change the URL, events or enabled flag, or rotate the secret. |
  | `POST /settings/webhooks/delete` | Remove an endpoint. |
  | `POST /settings/webhooks/test` | Send a test event. |

  There are matching MCP tools, `medialit webhooks …` in the CLI, and a dashboard page.
- The OpenAPI spec (`swagger_output.json`) is regenerated.

## 8. Deployment and testing

- **`docker-compose.yml`:** a `medialit-worker` service that uses the same image with `command: ["bun", "apps/api/src/worker.ts"]`.
- **Local:** `bun --filter @medialit/api dev:worker` runs next to `dev`.
- **Infra repo:** a worker Deployment for QA and prod with one replica each, using the same image tag. `deploy.sh medialit qa` rolls out the API, the web app and the worker together.
- **`.env.example`:** the new variables are `WORKER_PORT`, `WORKER_CONCURRENCY_CPU`, `WORKER_CONCURRENCY_IO`, `WORKER_CLASSES`, `WORKER_SHUTDOWN_GRACE_MS`, `SEAL_WAIT_MS`, `SEAL_CLAIM_MS`, `WEBP_MAX_INPUT_BYTES`, `WEBP_MAX_PIXELS`, `WEBP_MAX_MEMORY_MB`, `WEBP_TIMEOUT_MS`, `WEBP_CONCURRENCY`, `WEBP_QUEUE_WAIT_MS`, `OPERATOR_ALERT_EMAIL` and `WEBHOOK_ALLOW_PRIVATE_NETWORKS`.
- **Docs:**
  - **Self-hosting:** the worker service, what it does, and what stops working without it.
  - **Upgrade guide** (in the separate Upgrades section): add the `medialit-worker` service to your Compose file before upgrading, and note the changes to the upload response (D5).
  - **API reference and changelog:** the new response fields, the webhook routes and the upload response change.
- **Tests:**
  - Unit tests for the queue (claiming, leases, the reaper, retries, cancellation by cascade, two workers racing for jobs) run against real Postgres.
  - `test:integration:stack` starts a worker.
  - Integration tests cover:
    - a temp image is never converted;
    - sealing a public image returns `main.webp`, the public bucket has only `main.webp`, and the private bucket has no main file;
    - sealing a private image leaves only `main.webp` in the private bucket;
    - a conversion failure at seal keeps the original and still seals;
    - two concurrent seals of the same media convert it once;
    - a seal whose claim expired (the first seal died) is taken over by the next seal;
    - a delete during seal leaves no files behind;
    - an image over `WEBP_MAX_PIXELS` (a small PNG with huge dimensions) keeps the original and seals, without decoding it;
    - a conversion over `WEBP_TIMEOUT_MS` leaves no `cwebp` process running;
    - seals beyond `WEBP_CONCURRENCY` seal without converting after `WEBP_QUEUE_WAIT_MS`;
    - webhook URLs that resolve to each refused range are refused at save and at delivery, including a hostname whose DNS answer changes between the two, and a redirect to a private address is not followed;
    - webhook delivery, retries and signing, with a test job type;
    - delete while a job is running;
    - every job state change writes one log line, and a job that fails for good raises one exception with `source: "worker.<job_type>.failed"`;
    - with two workers running, only one runs the alert checks, and each alert code pages at most once in 30 minutes;
    - stopping all workers makes the API page `jobs_no_worker` within 5 minutes;
    - the `jobs` commands work against the stack's Postgres.
  - The AGENTS.md end-to-end checks (REST form-data and tus, browser, CLI) must pass with the worker running. For WebP, "same bytes" means the sealed file matches what the converter produces, not the uploaded bytes.

## 9. Operations

Monitoring follows SendLit's setup, through `@codelitdev/observability` (PostHog). There is no metrics stack and no admin web page.

**Telemetry setup** (`apps/api/src/services/log.ts`, shared by the API and the worker):

- When `POSTHOG_API_KEY` is set, every log line at `LOG_LEVEL` and above is also sent to PostHog's logs endpoint (`${POSTHOG_HOST}/i/v1/logs`, with the key as a bearer token). Without the key, logs go to stdout only and capture calls do nothing. No new variable.
- Two instances, as in SendLit's `observability/instance.ts`: one for errors and logs (deduplicated and rate-capped), and one for product events, with deduplication and the cap off and no logs.
- `serviceName` is `medialit-api` for the API and `medialit-worker` for the worker.
- Property keys are snake_case. `media_id`, `job_id` and `app_id` go in `contextPolicy.identifierKeys`, so the 40-character IDs are not masked as tokens. Today `mediaId` reaches PostHog as `[redacted-token]`. The existing `mediaId` key is renamed to `media_id`.
- New allowlisted keys: `media_id`, `job_id`, `app_id`, `job_type`, `job_class`, `attempts_made`, `failed_reason`, `duration_ms`, `wait_ms`, `worker_id`, `alert_code`, `age_ms`, `count`, `reason`.

**Logs.** One line per job state change, with `job_id`, `job_type`, `media_id`, `app_id`, `attempts_made` and `worker_id`:

| Message | Level | Extra fields |
|---|---|---|
| `job claimed` | debug | `wait_ms` (time spent queued) |
| `job succeeded` | info | `duration_ms` |
| `job will retry` | warn | `duration_ms`, `failed_reason`, `next_run_in_ms` |
| `job failed` | error | `duration_ms`, `failed_reason`, `error` (shortened, with no URLs) |
| `job reaped` | warn | the worker whose lease expired |
| `job cancelled` | info | (the media was deleted) |
| `webp skipped` (API, at seal) | info | `reason`: `busy`, `too_large`, `too_many_pixels`, `timeout` or `failed` |

`failed_reason` is a fixed class: `timeout`, `storage`, `db`, `not_enough_storage`, `bad_input`, `http_status`, `connection_failed`, `blocked_address` or `internal`.

**Exceptions** (`captureException`), named like SendLit's BullMQ worker events:

| Source | When | Severity |
|---|---|---|
| `worker.<job_type>.failed` | a job fails for good. Not for `webhook.deliver`: a tenant's failing endpoint is theirs to fix, and shows in their dashboard. | `critical` when `failed_reason` is `db`, `storage` or `internal`, otherwise `error` |
| `worker.<job_type>.reaped` | the reaper requeues or fails a job whose lease expired. One per sweep, with `count`. | `warning` |
| `worker.error` | the runner itself fails (claiming, heartbeat, `LISTEN` connection) | `error` |

The subject is the app ID, and the context is `job_id`, `job_type`, `attempts_made` and `failed_reason`.

**Alerts are checked in code and emailed,** as SendLit's billing alerts are (`src/billing/alerts.ts`). There are no PostHog alert rules.

- **Who checks:** every minute, the worker that holds a Postgres advisory lock (`pg_try_advisory_lock`) runs the checks, so only one worker pages however many replicas run. The API runs the checks that depend on it.
- **What a page does:** it writes an error log line with `alert_code`, sends an `operations.page` event, raises a `critical` exception with `source: "operations.alerts"`, and emails `OPERATOR_ALERT_EMAIL` (comma-separated) through the existing `EMAIL_*` SMTP settings. Outside production it only logs. Each alert code waits 30 minutes before paging again. If `OPERATOR_ALERT_EMAIL` is empty, the email is skipped and the rest still happens.

| Code | Checked by | Condition |
|---|---|---|
| `jobs_queue_lag` | worker | the oldest queued job is more than 10 minutes old |
| `jobs_failure_spike` | worker | more than 10 jobs failed for good in the last 10 minutes |
| `jobs_no_worker` | API | a job class (`cpu`, `io`) has had no live worker for 5 minutes. Run by the API, because when every worker is down no worker can report it. |
| `webp_busy` | API | seal skipped WebP for lack of a free conversion slot in the last 10 minutes (counted in the API process) |

**Operator command-line tool:** `bun --filter @medialit/api jobs <command>` runs `scripts/jobs.ts`, which calls `src/jobs/operator-cli.ts`, following SendLit's `bun run billing`. It connects with `DATABASE_URL`, so on the cluster it runs with `kubectl exec` in the worker pod.

| Command | What it does |
|---|---|
| `jobs stats` | counts by type and status, the oldest queued job's age, failures in the last hour, live workers |
| `jobs list --status failed --type <type> --since 1h` | jobs with their `failed_reason` and shortened error |
| `jobs show <jobId>` | the full row; secrets are never in payloads (D8) |
| `jobs media <mediaId>` | every job and derivative for one media item |
| `jobs retry <jobId>` / `jobs retry --type <type> --status failed --since 1h` | queue again, with attempts reset |
| `jobs cancel <jobId>` | cancel a queued job |
| `jobs workers` | live workers, their classes, and when each was last seen |

Bulk `retry` and `cancel` print how many jobs they would change and need `--yes`.

**Self-hosting docs:** a short runbook covering what each alert code means, the `jobs` commands, and SQL for the queue depth, the oldest queued job and recent failures, for installs without PostHog.

## 10. Rollout

- Migration: create the new tables, and add `processing_status` (default `'ready'`) and `processing_error`.
- **Temp media uploaded before the deploy** was already converted by the old code, so seal skips it.
- **Deploy order:** start the worker before the new API, because the cleanup timers move to the worker. Seal doesn't depend on the worker.
- **Rollback:** the old API ignores the new tables and columns. The old API seals media without converting it, and the old cleanup timers come back.

## 11. Order of work

1. **#160 jobs:** the queue, `worker.ts`, health checks, the cleanup timers moved to scheduled jobs, Compose, infra, the integration stack, and operations (section 9: telemetry setup, job logs and exceptions, alert checks, the `jobs` tool).
2. **#261 derivatives and status:** schema, response fields, `media.publish`, delete by prefix, storage accounting. Can run in parallel with step 3.
3. **#262 WebP at seal and thumbnails:** move WebP from upload to seal (D5), the #256 fix to the inline thumbnail, and the `webp skipped` log line. The `webp_busy` alert lands with step 1's alert checks. Doesn't depend on the queue.
4. **#198 webhooks:** endpoints, delivery, signing, SSRF guard, and the dashboard. Depends on steps 1 and 2.

## 12. Decisions made in review

- **Processing only after seal.** Compute is spent only on files that are kept. Thumbnails are the one exception (D4). Thumbnails made on request may remove it later; see the note on #196.
- **WebP runs inside seal, not as a job** (D5). A job would have to fall back to the original when it ran late, and clients would then keep requesting the non-WebP file forever.
- **The upload response reports the original file, MIME type and size until seal.** Clients that save `size` or `mimeType` from the upload response hold the values from before conversion. This is accepted, and it goes in the changelog.
- **Seal claims the media instead of holding a row lock while converting** (D5). A transaction held open through a 30 s conversion ties up a pool connection, and enough concurrent seals would take the API down for every tenant. The claim, convert, commit sequence holds a lock only for the two short transactions.
- **When the API is busy converting, seal skips WebP instead of failing or waiting longer.** A failed seal loses the media after 24 hours, and a longer wait runs into client request timeouts.
- **Monitoring follows SendLit** (section 9): logs, exceptions and in-code alert checks that email operators, through `@codelitdev/observability`, not a metrics stack or PostHog alert rules. `OPERATOR_ALERT_EMAIL` is the only alert setting.
- **We build the queue ourselves** (D1), not with pg-boss or BullMQ.
- **`processing` and `derivatives` are added to the media responses** (section 7).
