# @medialit/api

## 0.7.0

### Minor Changes

- fe2b21f: Media responses gain `processing` (`pending` until seal, then `processing`, `ready` or `failed`) and `derivatives` (outputs made from the original, by name, each with a status and, once ready, a URL). Uploads record their thumbnail as the `thumbnail` derivative. Deleting media now removes everything under its folder in both buckets. The worker gains `media.publish`, which copies ready derivatives to the public bucket, and a periodic check that settles media whose processing stopped. No existing field changes.
- 24deeff: Webhooks for media processing. Apps can have up to 10 endpoints, managed with `POST /settings/webhooks/create`, `/get`, `/update` (URL, events, enabled, or rotate the secret), `/secret` (reveal the signing secret, which needs write access), `/delete` and `/test`, the matching MCP tools (`list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`), `medialit webhooks …` in the CLI, the SDK's `listWebhooks`, `createWebhook`, `updateWebhook`, `revealWebhookSecret`, `deleteWebhook` and `testWebhook`, and a dashboard page that also lists recent deliveries. Listing endpoints returns only a `secretHint`; the full secret comes back from create, rotate and the reveal action.

    When a job finishing moves sealed media to `ready` or `failed`, the worker sends `media.processing.ready` or `media.processing.failed`, signed per Standard Webhooks, and retries for about 24 hours with the same `webhook-id`. Webhook URLs are checked when saved and before every delivery: production accepts `https` only, and private, internal and cloud-metadata addresses are refused (set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` on self-hosted installs whose receivers are on their own network). Deleting an app now also deletes its webhook endpoints and cancels its queued and running jobs. No existing field changes.

    The REST rate limit (120 requests a minute per client by default) can now be set with `API_RATE_LIMIT_PER_MINUTE`. The integration tests wait out a rate limit instead of failing.

- 12f9910: WebP conversion moves from upload to seal. For apps with WebP on, the upload response now reports the original file, its MIME type and its uploaded size; the seal response reports the WebP. Temporary uploads that are never sealed are not converted, and a failed or skipped conversion keeps the original instead of failing the request (`processing.status` is `failed` for a failed conversion, and `processing.error` gives the reason in both cases). Concurrent seals of the same media convert it once; a second seal waits up to `SEAL_WAIT_MS` and then answers 503 with `Retry-After`.

    Conversion is bounded by `WEBP_MAX_INPUT_BYTES`, `WEBP_MAX_PIXELS` (read from the header without decoding), `WEBP_MAX_MEMORY_MB` (`prlimit --as`), `WEBP_TIMEOUT_MS` (kills the whole process group) and `WEBP_CONCURRENCY`/`WEBP_QUEUE_WAIT_MS`. These limits live in `@medialit/images`, which replaces `convertToWebp(path, quality)` with a limited `convertToWebp(input, output, options)` and adds `readImageInfo`, `checkImageFile`, `runLimited` and `Slots`.

    Image and video thumbnails follow the app's `thumbnailWidth` × `thumbnailHeight` (resized and cropped) when the app has set them; apps that never set them keep today's thumbnails (images cropped to 16:9, at most 480 px tall; videos 720 px tall), and 1-pixel-tall images now get a thumbnail too. `@medialit/thumbnail`'s `forImage` and `forVideo` take an optional size as a third argument, and the `generate-thumbnail` script is removed.

### Patch Changes

- Updated dependencies [fe2b21f]
- Updated dependencies [24deeff]
- Updated dependencies [12f9910]
    - @medialit/models@0.2.0
    - @medialit/images@0.1.0
    - @medialit/thumbnail@0.1.0

## 0.6.0

### Minor Changes

- 5ff2d16: Add operations for the job queue: logs and errors from the API and the worker go to PostHog when `POSTHOG_API_KEY` is set, alerts for a missing worker, a slow queue and failing jobs are emailed to `OPERATOR_ALERT_EMAIL`, and a `jobs` command shows, retries and cancels jobs.
- fdcbf61: Background jobs now run in a separate worker process, started from the same image with `bun apps/api/src/worker.ts`. Cleanup of expired and unfinished uploads moves from the API to the worker and runs once per installation. Self-hosted installs must add the worker service before upgrading; see the upgrade guide.

## 0.5.1

### Patch Changes

- 210e4c9: Thumbnail generation now opens only common video and image formats, reads videos only over HTTP(S) and images only from local files, and stops ffmpeg after 60 seconds. Uploads in other formats are still stored, but get no thumbnail.

## 0.5.0

### Minor Changes

- 3f1e412: Uploads now stream straight to the bucket as S3 multipart uploads, for both regular and resumable (tus) uploads, instead of being written to the server's disk first. Resumable uploads can continue on any API instance. A rejected or abandoned upload leaves nothing in the bucket, and every upload is recorded as it starts, so the temp cleanup job also removes what a server crash leaves behind. With WebP on, only the WebP file is kept and its size is what counts toward storage. Resumable uploads must now declare their size up front. Part size and concurrency are set with `UPLOAD_PART_SIZE_BYTES` and `UPLOAD_PART_CONCURRENCY`. Requests no longer time out after five minutes; a connection is closed only after `REQUEST_IDLE_TIMEOUT_MS` with no data. Regular uploads per process are capped by `MAX_CONCURRENT_FORM_UPLOADS`, answering 503 with `Retry-After` over the cap. An upload a crash interrupts is cleaned up after `UPLOAD_STALE_MINUTES` (30) with no activity; resumable uploads stay resumable until they expire.

## 0.4.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.0.28

### Patch Changes

- Updated dependencies [4c480c7]
    - @medialit/thumbnail@0.0.28
    - @medialit/images@0.0.26

## 0.0.27

### Patch Changes

- Updated dependencies [0ecea51]
    - @medialit/thumbnail@0.0.27

## 0.0.26

### Patch Changes

- Updated dependencies [bbb81e7]
    - @medialit/thumbnail@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [7a07e615]
    - @medialit/thumbnail@0.0.25
    - @medialit/images@0.0.25
