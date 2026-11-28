# @medialit/api

## 0.10.0

### Minor Changes

- 4819104: Captions are made. With `generateCaptions` on, sealed videos and audio files get a `captions` derivative: WebVTT captions (`url`, also `files.vtt`), a plain transcript (`files.text`) and a JSON transcript with timed segments (`files.json`), plus the spoken `language`. They are transcribed by the transcription worker, count the file's length in processing minutes, and fail with `no_audio_stream` for a file with no audio. `MediaLitVideo` shows them as a `<track>` and now forwards a `ref` to its `<video>` element. The dashboard's file details show the captions and link the files, and `medialit get` notes them on stderr. A new alert, `captions_volume`, emails at most once a day when more than `CAPTIONS_DAILY_MINUTES_ALERT` minutes are captioned in 24 hours.
- 6dd28df: A new media setting, `generateCaptions` (off by default), in the REST API, the MCP server, the SDK, `medialit settings set --captions` and a **Captions** card in the dashboard. Settings report `captionsAvailable`, false when no transcription worker is running. Seals can override it per upload (`processing.generateCaptions`, `--captions` on `upload` and `seal`). Captions never hold up a file's processing status: they report through a new opt-in webhook, `media.captions.ready`, sent only to endpoints that list it. Workers gain a `transcribe` job class, served only when `WORKER_CLASSES` lists it (`WORKER_CONCURRENCY_TRANSCRIBE`, default 1).
- b4bb02c: Sealing can override the app's processing settings for one upload: `POST /media/seal/{mediaId}` takes an optional `processing: { videoStreaming }`, and so do MCP's `seal_media`, the SDK's `seal(mediaId, { processing })` and the CLI's `upload` and `seal` (`--video-streaming`). A field left out uses the app's setting, and sealing again ignores it. Use it to process some users' videos and not others, for example to skip HLS for trial accounts.
- 996c15f: A new image, `codelit/medialit-transcribe`, for the transcription worker: the API image plus faster-whisper and the `large-v3-turbo` model (int8, pinned), running the worker for the `transcribe` job class. `docker-compose.yml` runs it behind the `captions` profile (`docker compose --profile captions up -d`). See Self-hosting › Run the transcription worker.

### Patch Changes

- Updated dependencies [4819104]
    - @medialit/models@0.3.0

## 0.8.0

### Minor Changes

- 450be9d: Thumbnail sizes are no longer a setting. Every app gets the standard thumbnails: 16:9 and at most 480 pixels tall for images, 720 pixels tall for videos. `thumbnailWidth` and `thumbnailHeight` are gone from the media settings in the REST API, the MCP server and the SDK's types; the API ignores them if a client still sends them. WebP quality now defaults to 80, so an app that turns WebP on without a quality no longer gets quality 0, and a quality must be from 1 to 100. App settings in the dashboard is now split into tabs (General, API keys, Media and Webhooks). The Media tab has the Image optimization and Video streaming settings.
- 022aaca: Media responses gain `metadata`: duration, size as displayed, rotation, frame rate, codecs, bitrate, sample rate, channels and format, read when the media is sealed (ffprobe for audio and video, the header for images). It is `null` before seal, or when the file can't be read; seal never fails because of it and waits at most 2 seconds for it. When seal runs out of time for a video, for example a phone recording whose index is at the end of the file, the video's poster job reads the metadata and fills it in. Logs no longer include presigned URLs from failed thumbnails or metadata reads.
- 4643c6c: Video processing. Two new media settings, `videoStreaming` (`off`, `hls` or `mp4`) and `hlsRenditions`, are in the REST API, the MCP server, the SDK (`getSettings` and `updateSettings`), the new `medialit settings` command and the dashboard's Media tab. Each app chooses for itself, and every app starts `off`. Storage stats everywhere now include the month's video processing minutes. `MCP_RATE_LIMIT_PER_MINUTE` sets the MCP server's per-client limit (60 by default).

    - **Posters.** Sealed videos get a poster from about 10% in (at most 10 seconds), skipping dark frames, published over the video's `thumb.webp`, so saved thumbnail URLs show it. A sealed video is `processing` until its derivatives settle, then a `media.processing.ready` webhook fires. A failed poster keeps the upload thumbnail and still settles the media `ready`.
    - **MP4** (`videoStreaming: "mp4"`): the `mp4` derivative, H.264 and AAC with the index at the front. Web-ready sources are remuxed in seconds and cost no minutes; others are re-encoded at most at 1080p, never upscaled.
    - **HLS** (`videoStreaming: "hls"`): the `hls` derivative, the renditions in `hlsRenditions` that aren't larger than the video, in 6-second fMP4 segments. `derivatives.hls.url` is the master playlist: a storage URL for public videos, and a signed API URL (`/media/:mediaId/hls/:token/master.m3u8`) for private ones.
    - **Player.** `@medialit/react` gains `MediaLitVideo`, which plays HLS, then the web MP4, then the original. It plays HLS with hls.js (loaded only when needed) wherever the browser has Media Source Extensions, and natively only without them, as on iPhone: desktop Chrome and Edge claim native HLS support but can fail to play it. If HLS fails either way, it switches to the web MP4 or the original. The dashboard's file preview uses it, labels what it plays, and its details show each video's streaming status: HLS or MP4 and whether it is processing, ready or failed, or that streaming is off for the video, with a link to the setting.

    Workers run a new `video` job class, and a `video_queue_lag` alert pages when a video job waits more than 6 hours. Self-hosted installs need a bigger worker and a CORS rule on storage; see the [v0.8.x to v0.9.0 upgrade guide](https://medialit.cloud/docs/upgrade-from-v0-8-x-to-v0-9-0) for the settings and limits.

### Patch Changes

- 407763c: Product events and log lines for the media lifecycle, through `@codelitdev/observability`: uploads, seals, processing results, deletes, webhook deliveries, webhook endpoint changes and media settings changes. Events carry only IDs, kinds, counts, sizes and durations, never file names, URLs or secrets. The dashboard identifies the signed-in user by ID so its events join the API's. The Codelit platform packages move to 0.15.0.

## 0.7.1

### Patch Changes

- ef88146: The sign-in and app-picker pages show the MediaLit logo and favicon again. A stale `public/icon.svg` from 2024 was shadowing the current logo at `/icon.svg`. The app picker also fits phone screens.
- 486a684: The API reference groups the media settings routes under "Media processing", which names what they control (WebP conversion and thumbnail sizes), not "Settings".
- 561593b: Update the Codelit platform packages to 0.14.1 and Better Auth to 1.7.22, which carries Better Auth security fixes. On the sign-in page, "Continue with email" now waits for the security check, and the page fits phone screens. Sessions use hardened cookie settings without renaming the cookie when `AUTH_COOKIE_DOMAIN` is set, so nobody is signed out. A new `TRUST_PROXY` setting lists the proxies to trust for the client address; `ENABLE_TRUST_PROXY` keeps working.
- ad8729d: Update the Codelit platform packages to 0.15.0: dialog header spacing in the dashboard and PostHog ingestion fixes for logs and errors.

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
