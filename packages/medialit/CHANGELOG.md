# medialit

## 0.5.0

### Minor Changes

- 450be9d: Thumbnail sizes are no longer a setting. Every app gets the standard thumbnails: 16:9 and at most 480 pixels tall for images, 720 pixels tall for videos. `thumbnailWidth` and `thumbnailHeight` are gone from the media settings in the REST API, the MCP server and the SDK's types; the API ignores them if a client still sends them. WebP quality now defaults to 80, so an app that turns WebP on without a quality no longer gets quality 0, and a quality must be from 1 to 100. App settings in the dashboard is now split into tabs (General, API keys, Media and Webhooks). The Media tab has the Image optimization and Video streaming settings.
- 022aaca: Media responses gain `metadata`: duration, size as displayed, rotation, frame rate, codecs, bitrate, sample rate, channels and format, read when the media is sealed (ffprobe for audio and video, the header for images). It is `null` before seal, or when the file can't be read; seal never fails because of it and waits at most 2 seconds for it. When seal runs out of time for a video, for example a phone recording whose index is at the end of the file, the video's poster job reads the metadata and fills it in. Logs no longer include presigned URLs from failed thumbnails or metadata reads.
- 4643c6c: Video processing. Two new media settings, `videoStreaming` (`off`, `hls` or `mp4`) and `hlsRenditions`, are in the REST API, the MCP server, the SDK (`getSettings` and `updateSettings`), the new `medialit settings` command and the dashboard's Media tab. Each app chooses for itself, and every app starts `off`. Storage stats everywhere now include the month's video processing minutes. `MCP_RATE_LIMIT_PER_MINUTE` sets the MCP server's per-client limit (60 by default).

    - **Posters.** Sealed videos get a poster from about 10% in (at most 10 seconds), skipping dark frames, published over the video's `thumb.webp`, so saved thumbnail URLs show it. A sealed video is `processing` until its derivatives settle, then a `media.processing.ready` webhook fires. A failed poster keeps the upload thumbnail and still settles the media `ready`.
    - **MP4** (`videoStreaming: "mp4"`): the `mp4` derivative, H.264 and AAC with the index at the front. Web-ready sources are remuxed in seconds and cost no minutes; others are re-encoded at most at 1080p, never upscaled.
    - **HLS** (`videoStreaming: "hls"`): the `hls` derivative, the renditions in `hlsRenditions` that aren't larger than the video, in 6-second fMP4 segments. `derivatives.hls.url` is the master playlist: a storage URL for public videos, and a signed API URL (`/media/:mediaId/hls/:token/master.m3u8`) for private ones.
    - **Player.** `@medialit/react` gains `MediaLitVideo`, which plays HLS, then the web MP4, then the original. It plays HLS with hls.js (loaded only when needed) wherever the browser has Media Source Extensions, and natively only without them, as on iPhone: desktop Chrome and Edge claim native HLS support but can fail to play it. If HLS fails either way, it switches to the web MP4 or the original. The dashboard's file preview uses it, labels what it plays, and its details show each video's streaming status: HLS or MP4 and whether it is processing, ready or failed, or that streaming is off for the video, with a link to the setting.

    Workers run a new `video` job class, and a `video_queue_lag` alert pages when a video job waits more than 6 hours. Self-hosted installs need a bigger worker and a CORS rule on storage; see the [v0.8.x to v0.9.0 upgrade guide](https://medialit.cloud/docs/upgrade-from-v0-8-x-to-v0-9-0) for the settings and limits.

## 0.4.0

### Minor Changes

- fe2b21f: Media responses gain `processing` (`pending` until seal, then `processing`, `ready` or `failed`) and `derivatives` (outputs made from the original, by name, each with a status and, once ready, a URL). Uploads record their thumbnail as the `thumbnail` derivative. Deleting media now removes everything under its folder in both buckets. The worker gains `media.publish`, which copies ready derivatives to the public bucket, and a periodic check that settles media whose processing stopped. No existing field changes.
- 24deeff: Webhooks for media processing. Apps can have up to 10 endpoints, managed with `POST /settings/webhooks/create`, `/get`, `/update` (URL, events, enabled, or rotate the secret), `/secret` (reveal the signing secret, which needs write access), `/delete` and `/test`, the matching MCP tools (`list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`), `medialit webhooks …` in the CLI, the SDK's `listWebhooks`, `createWebhook`, `updateWebhook`, `revealWebhookSecret`, `deleteWebhook` and `testWebhook`, and a dashboard page that also lists recent deliveries. Listing endpoints returns only a `secretHint`; the full secret comes back from create, rotate and the reveal action.

    When a job finishing moves sealed media to `ready` or `failed`, the worker sends `media.processing.ready` or `media.processing.failed`, signed per Standard Webhooks, and retries for about 24 hours with the same `webhook-id`. Webhook URLs are checked when saved and before every delivery: production accepts `https` only, and private, internal and cloud-metadata addresses are refused (set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` on self-hosted installs whose receivers are on their own network). Deleting an app now also deletes its webhook endpoints and cancels its queued and running jobs. No existing field changes.

    The REST rate limit (120 requests a minute per client by default) can now be set with `API_RATE_LIMIT_PER_MINUTE`. The integration tests wait out a rate limit instead of failing.

## 0.3.1

### Patch Changes

- 55a39d8: The `Media` type no longer has an `apikey` field. The API never returned it, and keys are now stored only as hashes.

## 0.3.0

### Minor Changes

- c3e3bd3: Add browser uploads. `@medialit/uploader` uploads files from the browser with the resumable tus protocol, `@medialit/react` adds the `MediaLitUploader` component and `useMediaLitUpload` hook, and `medialit` adds `createSignatureHandler` for the signature route they call.

    `medialit`: `upload()` now sends the file with Node's built-in `FormData`. With Node's `fetch`, it previously did not send the file. It also takes `fileName` and `mimeType` options.

    `@medialit/cli` adds the `medialit` command. `medialit login` signs in with the browser and the same app picker as the MCP server, and works with self-hosted servers.

    `medialit`: `list()` now sends paging and filters in the body, where the API reads them. They were previously ignored. The client also takes an OAuth `accessToken` instead of an API key.

    `@medialit/uploader`: uploads a Node.js file stream, and takes a `mimeType` option.

### Patch Changes

- c1b050b: `get()`, `seal()` and `delete()` now reject media IDs that aren't nanoids. Previously an ID such as `../signature/create` from a user changed which API endpoint the request reached, using your API key.

## 0.2.0

### Minor Changes

- 2e18d2b: Uploads are temporary by default

## 0.1.0

### Minor Changes

- c7d0050: API key and signature are passed via header instead of request body

## 0.0.1

### Patch Changes

- 2190697: First version of MediaLit nodejs sdk
