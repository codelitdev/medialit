# @medialit/web

## 0.5.0

### Minor Changes

- 4819104: Captions are made. With `generateCaptions` on, sealed videos and audio files get a `captions` derivative: WebVTT captions (`url`, also `files.vtt`), a plain transcript (`files.text`) and a JSON transcript with timed segments (`files.json`), plus the spoken `language`. They are transcribed by the transcription worker, count the file's length in processing minutes, and fail with `no_audio_stream` for a file with no audio. `MediaLitVideo` shows them as a `<track>` and now forwards a `ref` to its `<video>` element. The dashboard's file details show the captions and link the files, and `medialit get` notes them on stderr. A new alert, `captions_volume`, emails at most once a day when more than `CAPTIONS_DAILY_MINUTES_ALERT` minutes are captioned in 24 hours.
- 6dd28df: A new media setting, `generateCaptions` (off by default), in the REST API, the MCP server, the SDK, `medialit settings set --captions` and a **Captions** card in the dashboard. Settings report `captionsAvailable`, false when no transcription worker is running. Seals can override it per upload (`processing.generateCaptions`, `--captions` on `upload` and `seal`). Captions never hold up a file's processing status: they report through a new opt-in webhook, `media.captions.ready`, sent only to endpoints that list it. Workers gain a `transcribe` job class, served only when `WORKER_CLASSES` lists it (`WORKER_CONCURRENCY_TRANSCRIBE`, default 1).

### Patch Changes

- Updated dependencies [4819104]
    - @medialit/models@0.3.0
    - @medialit/react@0.4.0

## 0.4.0

### Minor Changes

- 450be9d: Thumbnail sizes are no longer a setting. Every app gets the standard thumbnails: 16:9 and at most 480 pixels tall for images, 720 pixels tall for videos. `thumbnailWidth` and `thumbnailHeight` are gone from the media settings in the REST API, the MCP server and the SDK's types; the API ignores them if a client still sends them. WebP quality now defaults to 80, so an app that turns WebP on without a quality no longer gets quality 0, and a quality must be from 1 to 100. App settings in the dashboard is now split into tabs (General, API keys, Media and Webhooks). The Media tab has the Image optimization and Video streaming settings.
- 4643c6c: Video processing. Two new media settings, `videoStreaming` (`off`, `hls` or `mp4`) and `hlsRenditions`, are in the REST API, the MCP server, the SDK (`getSettings` and `updateSettings`), the new `medialit settings` command and the dashboard's Media tab. Each app chooses for itself, and every app starts `off`. Storage stats everywhere now include the month's video processing minutes. `MCP_RATE_LIMIT_PER_MINUTE` sets the MCP server's per-client limit (60 by default).

    - **Posters.** Sealed videos get a poster from about 10% in (at most 10 seconds), skipping dark frames, published over the video's `thumb.webp`, so saved thumbnail URLs show it. A sealed video is `processing` until its derivatives settle, then a `media.processing.ready` webhook fires. A failed poster keeps the upload thumbnail and still settles the media `ready`.
    - **MP4** (`videoStreaming: "mp4"`): the `mp4` derivative, H.264 and AAC with the index at the front. Web-ready sources are remuxed in seconds and cost no minutes; others are re-encoded at most at 1080p, never upscaled.
    - **HLS** (`videoStreaming: "hls"`): the `hls` derivative, the renditions in `hlsRenditions` that aren't larger than the video, in 6-second fMP4 segments. `derivatives.hls.url` is the master playlist: a storage URL for public videos, and a signed API URL (`/media/:mediaId/hls/:token/master.m3u8`) for private ones.
    - **Player.** `@medialit/react` gains `MediaLitVideo`, which plays HLS, then the web MP4, then the original. It plays HLS with hls.js (loaded only when needed) wherever the browser has Media Source Extensions, and natively only without them, as on iPhone: desktop Chrome and Edge claim native HLS support but can fail to play it. If HLS fails either way, it switches to the web MP4 or the original. The dashboard's file preview uses it, labels what it plays, and its details show each video's streaming status: HLS or MP4 and whether it is processing, ready or failed, or that streaming is off for the video, with a link to the setting.

    Workers run a new `video` job class, and a `video_queue_lag` alert pages when a video job waits more than 6 hours. Self-hosted installs need a bigger worker and a CORS rule on storage; see the [v0.8.x to v0.9.0 upgrade guide](https://medialit.cloud/docs/upgrade-from-v0-8-x-to-v0-9-0) for the settings and limits.

### Patch Changes

- 407763c: Product events and log lines for the media lifecycle, through `@codelitdev/observability`: uploads, seals, processing results, deletes, webhook deliveries, webhook endpoint changes and media settings changes. Events carry only IDs, kinds, counts, sizes and durations, never file names, URLs or secrets. The dashboard identifies the signed-in user by ID so its events join the API's. The Codelit platform packages move to 0.15.0.
- Updated dependencies [4643c6c]
    - @medialit/react@0.3.0

## 0.3.1

### Patch Changes

- ef88146: The sign-in and app-picker pages show the MediaLit logo and favicon again. A stale `public/icon.svg` from 2024 was shadowing the current logo at `/icon.svg`. The app picker also fits phone screens.
- 561593b: Update the Codelit platform packages to 0.14.1 and Better Auth to 1.7.22, which carries Better Auth security fixes. On the sign-in page, "Continue with email" now waits for the security check, and the page fits phone screens. Sessions use hardened cookie settings without renaming the cookie when `AUTH_COOKIE_DOMAIN` is set, so nobody is signed out. A new `TRUST_PROXY` setting lists the proxies to trust for the client address; `ENABLE_TRUST_PROXY` keeps working.
- ad8729d: Update the Codelit platform packages to 0.15.0: dialog header spacing in the dashboard and PostHog ingestion fixes for logs and errors.
- e483c35: Webhooks moved into App settings, next to API keys, and the sidebar no longer has a separate Webhooks item. Links to the old page open App settings at the Webhooks section.

## 0.3.0

### Minor Changes

- 24deeff: Webhooks for media processing. Apps can have up to 10 endpoints, managed with `POST /settings/webhooks/create`, `/get`, `/update` (URL, events, enabled, or rotate the secret), `/secret` (reveal the signing secret, which needs write access), `/delete` and `/test`, the matching MCP tools (`list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`), `medialit webhooks …` in the CLI, the SDK's `listWebhooks`, `createWebhook`, `updateWebhook`, `revealWebhookSecret`, `deleteWebhook` and `testWebhook`, and a dashboard page that also lists recent deliveries. Listing endpoints returns only a `secretHint`; the full secret comes back from create, rotate and the reveal action.

    When a job finishing moves sealed media to `ready` or `failed`, the worker sends `media.processing.ready` or `media.processing.failed`, signed per Standard Webhooks, and retries for about 24 hours with the same `webhook-id`. Webhook URLs are checked when saved and before every delivery: production accepts `https` only, and private, internal and cloud-metadata addresses are refused (set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` on self-hosted installs whose receivers are on their own network). Deleting an app now also deletes its webhook endpoints and cancels its queued and running jobs. No existing field changes.

    The REST rate limit (120 requests a minute per client by default) can now be set with `API_RATE_LIMIT_PER_MINUTE`. The integration tests wait out a rate limit instead of failing.

### Patch Changes

- Updated dependencies [fe2b21f]
- Updated dependencies [24deeff]
    - @medialit/models@0.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [aeefee3]
    - @medialit/uploader@0.3.0

## 0.2.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.1.3

### Patch Changes

- Updated dependencies [c3e3bd3]
    - @medialit/uploader@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [2e18d2b]
    - medialit@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [c7d0050]
    - medialit@0.1.0
