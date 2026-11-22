# Pipelines phase 1: video streaming and media processing

**Issue:** #258 (part of #247). Sub-issues: #139 (HLS), #264 (MP4 for the web), #267 (metadata), #265 (posters), #266 (audio extraction).

**Status:** Draft for review. The open decisions are in section 12; decisions made in review are recorded where they apply (D12). Observability, including what phase 0 left out, is in section 7.

## 1. Goal

Stream video with HLS, or serve an MP4 optimized for web playback, and do the processing they depend on. Everything runs on MediaLit's own workers with ffmpeg and needs no outside service, so self-hosted installs and the cloud work the same.

Two media settings control it: `videoStreaming` (`"off"`, `"hls"` or `"mp4"`) and `hlsRenditions`. Metadata, posters and audio extraction are internal steps with no settings.

This is the first phase with derivative jobs, so it is also the first phase in which webhooks fire for real uploads.

## 2. What exists after phase 0

- **Seal** (`apps/api/src/media/seal.ts`) claims the media, converts images to WebP, copies the main file and the thumbnail to the public bucket for public media, and commits. Its commit transaction runs `afterSealCommit` (`apps/api/src/media/derivatives.ts`), which today only publishes the thumbnail. No derivative jobs are queued yet.
- **After seal, the original of public media lives only in the public bucket.** Seal deletes the private `main.*` once it is copied. Private media keeps its original in the private bucket. A job that reads the original must look in the right bucket.
- **Derivative jobs** use `derivativeJob()`: `produce` writes under the media's private folder and returns a key (a file, or a prefix ending in `/`). `finishDerivative` checks storage, records the derivative, queues `media.publish` when the output must be public, and settles the media. Settling is derivative-based: the media becomes `ready` or `failed` when no derivative is `queued` or `processing`, and the webhook outbox runs in that transaction.
- `derivativesResponse` gives no URL to outputs with several files: "their manifests will". HLS is the first such output.
- `media.publish` already copies prefixes.
- **Job classes** are `cpu` (default: the number of cores) and `io`. Each job type has one fixed `timeoutMs`. A worker that shuts down puts its running jobs back in the queue without counting the attempt, so deploys don't use up attempts, but they do restart running jobs from the start.
- **The worker in QA and prod** runs one replica with a 1 CPU and 512 MiB limit, no `ephemeral-storage` limit, `WORKER_CONCURRENCY_CPU=1` and a 20 s shutdown grace.
- **Upload limits:** 50 MB on the free plan, 2 GB on the paid plan.
- **The video thumbnail** is made at upload from a presigned URL with ffmpeg (`packages/thumbnail`), restricted to an allowlist of container formats and protocols, under `runLimited` (timeout, process group kill, `prlimit`).
- **Media settings** exist in REST and MCP only, not in the CLI or the dashboard. `POST /settings/media/create` is a partial update: omitted fields keep their value. An app with no `media_settings` row gets defaults.
- **Billing** meters storage only. Nothing meters processing.
- **Signed URLs:** S3 presigned URLs expire after 15 minutes (the SDK default), CloudFront signed URLs after `CDN_MAX_AGE` (1 hour).
- The API image has `ffmpeg` and `cwebp`. It doesn't have libvips.

## 3. Decisions

### D1. Two new media settings, with a plan-based default

| Setting          | Values                                                | Default                     |
| ---------------- | ----------------------------------------------------- | --------------------------- |
| `videoStreaming` | `"off"` \| `"hls"` \| `"mp4"`                         | see below                   |
| `hlsRenditions`  | a non-empty subset of `1080p`, `720p`, `480p`, `360p` | `["1080p", "720p", "480p"]` |

- **Existing apps are `"off"`.** The migration writes `video_streaming = 'off'` for every app that exists, inserting a `media_settings` row where there isn't one. Their processing and storage use don't change without notice.
- **New apps follow the account's plan.** `video_streaming` is null for a new app, and null means: `"hls"` on self-hosted (OSS) installs and the paid plan, `"off"` on the free plan (#247, Plans). The default is resolved at seal, so an account that upgrades gets HLS on its new apps' next uploads without touching settings, and one that downgrades stops spending minutes it no longer has.
- `GET` returns the effective value and whether it was set: `videoStreaming: "hls"`, `videoStreamingDefault: true`. Setting a value stores it. Setting `null` goes back to the plan default.
- `hlsRenditions` is checked against the fixed list, deduplicated and stored sorted from largest to smallest. Users can't set bitrates or ffmpeg arguments.
- **No `1440p` or `2160p` for now.** On a 2 CPU worker, a 4K ladder of an hour-long video would take most of a day. Sources up to 2160p are still accepted and scaled down. The larger renditions can be added once encodes run on bigger nodes.
- Changing a setting affects media sealed afterwards. Seal copies the values into the job's params (phase 0, D9).
- **The free plan can turn HLS on.** It then uses its free minutes (D8).

### D2. Metadata is read at seal, inline, and stored on the media row (#267)

Seal reads the metadata before it commits and stores it in `media.metadata`. Video jobs then know at queue time what to do: which renditions fit, whether the MP4 can be remuxed, whether there is audio.

- **Video and audio:** `ffprobe` over a presigned URL, so only the container header and index are read. It runs under the same input allowlist and `runLimited` as the video thumbnail, with a 5 s timeout. Without a shell, in its own process group.
- **Images:** width, height and format from the header with `packages/images` (`readImageInfo` over ranged reads), as WebP already does. This covers PNG, JPEG, WebP and GIF. Other formats get no image metadata. We don't add libvips for this: the header reader already exists, is bounded, and doesn't decode.
- **Seal never fails because of metadata.** If the probe fails or times out, `metadata` stays null, seal still queues the jobs the MIME type calls for, and each video job probes again before it starts (D4). A job that probes successfully fills `metadata` if it is still null.
- **Cost:** one ffprobe per audio or video seal, typically 100–500 ms. CourseLit seals media one at a time when it publishes a page (phase 0, section 2, point 4), so this adds up for pages with many videos. It is bounded by the 5 s timeout.

Why inline and not a job: metadata has no file, so it isn't a derivative, and processing status is settled from derivatives. A metadata job would either be a fake derivative shown to users, or would have to queue the HLS and MP4 jobs itself, which leaves their derivative rows without a job while it runs and confuses the reconciler. Reading it at seal avoids both.

Shape, stored as `jsonb` and returned as-is. Fields that don't apply are omitted.

```ts
type MediaMetadata = {
    kind: "video" | "audio" | "image";
    durationSeconds?: number;
    width?: number; // as displayed, after rotation
    height?: number; // as displayed, after rotation
    rotation?: 0 | 90 | 180 | 270;
    frameRate?: number;
    videoCodec?: string; // e.g. "h264", "hevc", "vp9"
    audioCodec?: string; // e.g. "aac", "opus"; absent when there is no audio
    bitrate?: number; // bits per second, the whole file
    sampleRate?: number;
    channels?: number;
    format?: string; // the container or image format
};
```

### D3. A `video` job class

HLS and MP4 encodes use every core they get. Under the `cpu` class, whose default concurrency is the number of cores, a worker would run that many encodes at once, each with that many threads.

- New class `video`, default concurrency 1, set with `WORKER_CONCURRENCY_VIDEO`. ffmpeg uses all cores.
- Posters stay in `cpu`. Audio extraction is `cpu` too: it copies or re-encodes audio only.
- `WORKER_CLASSES` can keep video off a worker, so the cloud can later run encodes on separate nodes.

### D4. What a video job does with its input

Phase 1 is sized for sources up to about 1 GB: a typical course or marketing video, up to an hour or two of 1080p.

Every video job:

1. **Checks the size first.** Sources over `VIDEO_MAX_SOURCE_BYTES` (default 1 GiB) fail permanently with `source_too_large`, before anything is downloaded. The original still plays.
2. **Downloads the original to a local work directory** under the existing upload temp directory, from the private bucket for private media or the public bucket for public media (section 2), with S3 credentials, not through the CDN. ffmpeg doesn't read over the network:
    - A presigned URL expires after 15 minutes. ffmpeg makes new range requests when it seeks, when an MP4 has its index at the end, or when it reconnects, and after the URL expires those get a 403 halfway through the encode.
    - With a local file, ffmpeg runs with `-protocol_whitelist file`, so a crafted input can't make it open any network address.
3. **Probes it** (D2) and refuses, as a permanent failure with a clear `error`, sources that are over `VIDEO_MAX_DURATION_SECONDS` (default 2 hours), larger than 2160p on the short side or 4096 px on the long side, or have no video stream.
4. **Runs ffmpeg** with the same container allowlist as the thumbnail, without a shell, in its own process group, under `prlimit --as` set by `VIDEO_MAX_MEMORY_MB` (default 1536, below the worker's memory limit, so `prlimit` kills ffmpeg before Kubernetes kills the worker). The handler's `AbortSignal` (media deleted, job cancelled, lease lost) kills the group. Every encode:
    - maps streams explicitly (`-map 0:v:0 -map 0:a:0?`) and drops subtitle, data and attachment streams;
    - scales with `-2` for the computed side, so widths and heights stay even, as H.264 requires;
    - downmixes audio to stereo (`-ac 2`);
    - strips container metadata (`-map_metadata -1`), such as a phone's GPS location;
    - caps the output at `-t VIDEO_MAX_DURATION_SECONDS`, so a file whose header claims a short duration can't produce an unbounded output.
5. **Starts from a clean prefix.** Each attempt deletes what an earlier attempt of the same job wrote under its output key before uploading.
6. Uploads the output to the media's private folder, and removes the work directory in every case.
7. **Times out** after `max(15 min, 4 × duration)`, using the duration from the probe. The job enforces it itself. The job type's `timeoutMs` is set to the largest possible value (4 × `VIDEO_MAX_DURATION_SECONDS`), because the runner's timeout is fixed per type (section 2). A header that understates the duration makes the timeout shorter, never longer, so it also bounds a lying file. The factor of 4 is checked against the benchmark in steps 4 and 5 (section 10) before release.

**Retries.** Derivative jobs get 3 attempts (phase 0), but retrying a deterministic failure only repeats it:

- **Permanent:** ffmpeg exits with an error code (the file is bad or unsupported), the timeout, any limit from step 1 or 3, and running out of minutes.
- **Retried:** storage and database errors, and ffmpeg killed by a signal other than the job's own abort (for example the out-of-memory killer), which can be the worker rather than the file.

**Sizing for a 1 GB source:** the work directory holds the source (up to 1 GB) and the output. An HLS ladder of 1080p, 720p and 480p for an hour of video is about 2.5 GB at the capped bitrates (D5), and less for most sources. The worker gets 2 CPU, a 2 GiB memory limit and an `ephemeral-storage` limit of 5 GiB (section 8). Kubernetes evicts the worker if it exceeds that, instead of filling the node's disk.

**Expected speed:** on 2 CPU, a three-rendition 1080p ladder runs at roughly 0.5× to 1× real time, so an hour of video takes one to two hours. Steps 4 and 5 measure this on the QA worker, and the timeout factor and `video_queue_lag` (7.6) are set from the result.

### D5. HLS (#139)

- **One ffmpeg run makes every rendition** (one decode, several outputs) with `-var_stream_map`.
- **Renditions:** the chosen ones that aren't larger than the source, compared on the short side, so a portrait 1080×1920 video counts as 1080p. If none fit (a 360p upload with the default `1080p, 720p, 480p`), one rendition at the source's size is made. Frame rate is kept, capped at 60.
- **Codecs:** H.264 (High profile, `yuv420p`) and AAC-LC stereo at 128 kbps, 48 kHz. Each rendition uses capped CRF: `-crf 21` with `-maxrate` and `-bufsize` from the table, `-preset veryfast`.

    | Rendition | Short side | Max video bitrate |
    | --------- | ---------- | ----------------- |
    | 1080p     | 1080       | 5 Mbps            |
    | 720p      | 720        | 2.8 Mbps          |
    | 480p      | 480        | 1.4 Mbps          |
    | 360p      | 360        | 0.8 Mbps          |

    `bufsize` is 1.5 × the max bitrate. These are constants in code.

- **Segments:** 6 s, fMP4 (CMAF), with keyframes forced every 2 s and scene-cut keyframes off, so segment boundaries line up across renditions. fMP4 plays in hls.js and in Safari since iOS 10, and phase 3 DRM (Widevine, FairPlay) needs it. With TS segments, phase 3 would mean encoding everything again.
- **Audio** is muxed into every rendition. A video with no audio stream gets video-only renditions.
- **Layout**, under the media's folder: `hls/master.m3u8`, `hls/v{n}/index.m3u8`, `hls/v{n}/init.mp4` and `hls/v{n}/seg{nnnnn}.m4s`. The master playlist sets `BANDWIDTH`, `RESOLUTION`, `FRAME-RATE` and `CODECS` for every rendition, and all URIs in it are relative.
- The derivative is `hls`, with key `hls/` and the sum of its file sizes. `params` holds the renditions made and the settings used.

### D6. Playing HLS: public and private media

**Public media:** `media.publish` copies the `hls/` prefix to the public bucket (as for any prefix). `derivatives.hls.url` is the CDN URL of `hls/master.m3u8`. Relative URIs resolve against it.

**Private media:** a player can't send an API key, and a segment URL signed for 15 minutes stops a long video halfway. The API serves the playlists itself:

- `derivatives.hls.url` is `{API}/media/{mediaId}/hls/{token}/master.m3u8`. The token is an HMAC-SHA256 of the media ID and an expiry, signed with a key derived (HKDF, labelled for HLS playlists) from the API's existing auth secret, so there is no new environment variable. Rotating that secret invalidates playlist URLs already handed out.
- **The token lasts for the video's duration plus `CDN_MAX_AGE`**, not `CDN_MAX_AGE` alone. hls.js fetches a rendition's playlist only when it first switches to that rendition. With a one-hour token, a switch at minute 70 of a long video would get a 403 and stop playback.
- **The token is checked first,** with a constant-time comparison, before the media is looked up. Junk requests never reach the database, and the route can't be used to find out which media IDs exist.
- The master playlist is served unchanged. Its relative URIs resolve to `{API}/media/{mediaId}/hls/{token}/v{n}/index.m3u8`, which the API serves the same way.
- **Each rendition playlist is rewritten:** every segment URI and the `EXT-X-MAP` init URI (only names the encoder writes, `init.mp4` and `seg{nnnnn}.m4s`; any other line with a URI is refused) become signed storage URLs that expire after `durationSeconds + CDN_MAX_AGE` (at most 7 days, the S3 limit). A VOD player fetches each rendition playlist once, so the segments must stay valid for the whole video.
    - With `ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT`, the API signs **one CloudFront custom policy** for `hls/v{n}/*` and appends the same query string to every segment. One RSA signature per playlist instead of one per segment. #271 needs the same thing.
    - Otherwise each segment is presigned with S3 (HMAC, cheap: about 1,800 URLs for a one-hour video in three renditions).
- Responses have `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: private, max-age=60`, and CORS for any origin (the token is the credential).
- An expired or wrong token returns 403. With a valid token, a media item that is deleted, not sealed, or has no ready `hls` derivative returns 404.
- These routes use the existing API rate limiter.

**CORS on storage.** hls.js fetches playlists and segments with `fetch`, so Chrome and Firefox need CORS (`GET` and `HEAD` from any origin) on the public bucket, the private bucket and the CloudFront distribution. `<img>` and `<video>` never needed it, and Safari's native HLS doesn't either, so it isn't set today. Any origin is safe here: segment URLs are already signed, and public objects are public anyway.

- **CloudFront (QA and prod):** attach the managed response headers policy `Managed-SimpleCORS` to the behaviors that serve both buckets. CloudFront then adds `Access-Control-Allow-Origin: *` to every response, cached or not. Bucket CORS alone isn't enough behind CloudFront: S3 adds CORS headers only when the request has an `Origin` header, and CloudFront would cache a response without them and serve it to browsers.
- **S3 buckets:** `aws s3api put-bucket-cors` on both buckets, allowing `GET` and `HEAD` from `*` and exposing `Content-Length`, `Content-Range` and `ETag`. Needed where segments are served straight from S3 (self-hosted without CloudFront). Harmless behind CloudFront.
- The buckets and the distribution are set up by hand, not in the infra repo. The steps go in the infra README. QA is changed first, and prod by an operator when phase 1 is released.
- **MinIO** allows any origin by default (`MINIO_API_CORS_ALLOW_ORIGIN`), so local development needs no change. Step 5 checks this.
- **The API's playlist routes** set their own CORS headers (above).
- **Self-hosting docs:** the bucket CORS settings for S3, MinIO and other S3-compatible stores.

Alternative rejected: **CloudFront signed cookies** for the prefix. They need the player's page to share a parent domain with the CDN, and they don't exist for self-hosted installs on MinIO or S3. Serving playlists works everywhere.

### D7. MP4 for the web (#264)

- **Remux when possible:** if the source is H.264 `yuv420p` (not 10-bit, not 4:2:2), its audio is AAC or absent, it is MP4 or MOV, its short side is at most 1080, and its bitrate is at most 8 Mbps, the job runs `-c copy -movflags +faststart`. Seconds, and no quality loss.
- **Otherwise re-encode** to H.264 and AAC with `+faststart`, the same settings as the 1080p HLS rendition, at the source's size or 1080p, whichever is smaller. Never upscale.
- **The limit is fixed at 1080p** for now. A setting (`mp4MaxResolution`) waits until someone asks.
- **The original is kept.** The derivative is `mp4`, key `web.mp4`. Replacing the original like WebP does would change the `file` URL that clients saved from the seal response, which phase 0 rules out (phase 0, section 2, point 1).
- `params` records whether it was a remux or a re-encode.

### D8. Processing minutes

Encoding costs real CPU, and HLS is the default for new paid and self-hosted apps. The cloud can't turn it on without a limit, so metering ships with phase 1.

- **What counts:** the source's duration, rounded up to whole minutes, once per HLS job (not per rendition) and once per MP4 re-encode. Remuxes, posters, metadata and audio extraction don't count.
- **Allowance per calendar month (UTC):** free plan `PROCESSING_MINUTES_FREE` (default 5), paid plan `PROCESSING_MINUTES_PAID` (default 300, see section 12), self-hosted unlimited and not recorded.
- **Reserving:** when an encode starts, after the probe, the job takes a per-account advisory lock in a transaction, adds up the month's usage, and inserts a usage row if the minutes fit. The row is keyed by job ID, so a retry doesn't charge twice.
- **If the encode fails for good,** the row is deleted. Accounts pay only for output they get. The reconciler (phase 0) deletes it too when it fails a derivative whose job stopped without a result, for example when the worker died on the last attempt.
- **Out of minutes:** the derivative fails with `error: "out_of_processing_minutes"`, and the original stays playable (#247). The media settles `ready`, not `failed` (D12).
- **Shown to users** next to storage: the dashboard's app stats (`/api/apps/:appId/stats`) and the REST storage route gain the account's minutes used and allowed this month. Minutes are per account, like the storage limit.
- **Buying more minutes** is out of phase 1. The add-on comes with billing work later.

### D9. Posters replace the upload thumbnail (#265)

Phase 0 (D4) left this here: the upload thumbnail is the first frame, often black. After seal, a poster job makes a better one.

- Job `media.poster`, class `cpu`, for every sealed video with a video stream. No setting.
- **Picking the frame:** seek to 10% of the duration (at most 10 s in, 0 for videos under 1 s), then let ffmpeg's `thumbnail` filter pick the most representative frame from the next 50 frames. Black and near-black frames lose that choice. If every frame is black, the frame at the seek point is used.
- Sized like today's thumbnail: `thumbnailWidth` × `thumbnailHeight` when the app set them, otherwise 720 px tall (#256).
- **It replaces `thumb.webp`, from a key of its own.** The job writes the private `poster.webp` and records it as the `thumbnail` derivative, and `media.publish` copies it over the public `thumb.webp`. It must not write the private `thumb.webp`: seal queues the job in its commit transaction and deletes the private `thumb.webp` after the commit (phase 0, D5 step 6), so a poster written there in between would be deleted, and publishing would then fail on a missing source. `media.publish` therefore gains a destination key per derivative (`params.publicKey`). Today it copies to the same relative path. When it flips the row to the public bucket, it also sets `key` to `thumb.webp`, so `derivatives.thumbnail.url` points at the file that exists, and it deletes the private `poster.webp`. `ALWAYS_PUBLIC_DERIVATIVES` loses its unused `poster` entry: the poster is the `thumbnail` derivative. Clients that saved the thumbnail URL from the upload or seal response get the better frame with no change, which is how CourseLit, SendLit and FrontLit can benefit. A CDN may serve the old frame until its cache expires (`CDN_MAX_AGE`).
- If the upload thumbnail failed, the poster makes the first thumbnail, and `thumbnailGenerated` is set.
- If the poster fails, the upload thumbnail stays. The derivative is marked failed, and the media still settles `ready` (D12).

### D10. Audio extraction (#266)

- Job `media.audio`, class `cpu`. Copies the audio stream into an `.m4a` when it is AAC, otherwise encodes AAC 128 kbps. Derivative `audio`, key `audio.m4a`.
- Videos with no audio stream don't get the job (known from metadata at seal). If metadata is missing and the job finds no audio, the derivative is removed instead of failed, and the media settles without it.
- **Nothing queues it in phase 1.** `generateCaptions` (#269) will. Phase 1 builds and tests the handler so phase 2 starts from it (see section 12).

### D11. Which jobs seal queues

In the commit transaction (`afterSealCommit`), seal inserts a `queued` derivative row and queues a job for each step below, with the settings copied into `params`, and sets `processing_status = 'processing'` if it queued any.

| Media                          | Jobs                                    |
| ------------------------------ | --------------------------------------- |
| Video, `videoStreaming: "off"` | poster                                  |
| Video, `videoStreaming: "hls"` | poster, HLS                             |
| Video, `videoStreaming: "mp4"` | poster, MP4                             |
| Video with no video stream     | none (it is audio in a video container) |
| Image, audio, anything else    | none                                    |

So from phase 1 on, every sealed video goes through `processing` and fires a webhook, even with `videoStreaming: "off"`, because of the poster.

**Priority.** With one `video` slot, one account's long upload holds up everyone queued behind it. Seal queues paid-plan and self-hosted video jobs at priority 50 and free-plan ones at the default 100, using the plan it already resolves for the storage check. Within a priority, jobs run oldest first.

### D12. Failures that leave the media usable settle it `ready`

Today any failed derivative settles the media `failed` (`settleMedia`). From phase 1, a failure that leaves the media fully usable doesn't:

- **The poster**, whatever the error. The upload thumbnail stays.
- **HLS or MP4 refused by our limits:** `out_of_processing_minutes`, `source_too_large` or `source_too_long`. The original plays, and the file isn't at fault.

Encode failures (`bad_input`, `internal`, `timeout`) and any other failed derivative still settle the media `failed`, so the client and operators notice them.

`settleMedia` settles `ready` when every failed derivative is one of these, and `failed` when any other derivative failed, as today. Either way:

- The derivative is `failed` with its `error`, in the media response and in the webhook payload, which already carries each derivative's status and error.
- `processing.error` gives the reasons, as phase 0 does for a skipped WebP (`thumbnail: …; hls: out_of_processing_minutes`).
- The webhook sent is `media.processing.ready`. Clients that want to tell a client "out of minutes" read `derivatives.hls.error`.

This follows phase 0's rule that clients see `failed` only when the media isn't usable. #247 says to "send the failure webhook" when minutes run out. This decision replaces that: the event is `media.processing.ready`, with the failed `hls` derivative in its payload, and #247 is updated to match.

### D13. A player in `@medialit/react`

- `<MediaLitVideo media={media} />` plays `derivatives.hls.url` when ready, then `derivatives.mp4.url`, then `file`. It uses the poster (`thumbnail`) as `poster`.
- HLS plays natively where the browser supports it (Safari, iOS), otherwise with hls.js, loaded on demand so pages without video don't pay for it.
- Other players work with the URLs as they are. The docs show plain `<video>`, hls.js and Video.js.

## 4. Data model

```sql
media
  + metadata  jsonb                     -- D2; null until seal, or when the probe failed

media_settings
  + video_streaming  text               -- 'off' | 'hls' | 'mp4'; null = plan default (D1)
  + hls_renditions   text[]             -- null = default ladder

processing_usage (
  id          text primary key,
  user_id     text not null references "user"(id) on delete cascade,
  media_id    text references media(id) on delete set null,   -- deleting media keeps the usage
  job_id      text not null unique,
  kind        text not null,            -- 'hls' | 'mp4'
  minutes     int not null,
  created_at  timestamptz not null default now()
)
-- index on (user_id, created_at)
```

Migration: backfill `video_streaming = 'off'` for every existing app, inserting `media_settings` rows where missing (D1).

## 5. Flows

**Seal:** as in phase 0. Before the commit, read the metadata (D2). In the commit transaction, store it, queue the jobs from D11, and set the status.

**A video job:** start the derivative, check the size, download and probe the source (D4), reserve minutes for an encode (D8), run ffmpeg on the local copy, upload, finish the derivative (phase 0). On a permanent failure, release the minutes.

**Playback:** public media plays straight from the CDN. Private media plays through the API's playlist routes, with segments from storage (D6).

**Delete:** unchanged. The prefix delete removes `hls/`, `web.mp4`, `poster.webp` and `audio.m4a`. A running encode aborts on its next heartbeat. Usage rows stay.

## 6. API surface

These changes only add fields and routes.

- **Media settings** (REST `POST /settings/media/create` and `/get`, MCP): `videoStreaming`, `videoStreamingDefault` (read-only), `hlsRenditions`.
- **Media response** (REST, MCP, CLI, `@medialit/models`):
    - `metadata` (D2).
    - `derivatives.hls.url`: the master playlist (D6). `derivatives.mp4.url`: the MP4.
    - `derivatives.thumbnail` is `queued` while the poster is made.
- **New routes:** `GET /media/{mediaId}/hls/{token}/master.m3u8` and `GET /media/{mediaId}/hls/{token}/v{n}/index.m3u8` (D6). Unauthenticated, checked by the token.
- **CLI:** `medialit settings` with `get` and `set --video-streaming <off|hls|mp4|default> --hls-renditions 1080p,720p --webp <on|off> --webp-quality <n> --thumbnail <w>x<h>`. Media settings had no CLI command until now.
- **Dashboard:** a Media section in App settings, next to Webhooks: WebP, thumbnail size, video streaming and renditions. Processing minutes in the usage card.
- The OpenAPI spec is regenerated.

## 7. Observability and operations

Everything goes through `@codelitdev/observability`, set up in phase 0 (`apps/api/src/services/log.ts`): logs to stdout and, with `POSTHOG_API_KEY`, to PostHog's logs endpoint; exceptions to PostHog error tracking; product events on the separate events instance. Without the key, logs still go to stdout and capture calls do nothing. No new environment variable.

### 7.1 What phase 0 left out

Phase 0 shipped its section 9: the telemetry setup, a log line for every job state change, exceptions for jobs that fail for good or are reaped, the alert checks and the `operations.page` event. Three things are missing, and phase 1 adds them first (section 10, step 0), so the video work has a baseline to compare against:

- **No product events.** `operations.page` is the only event. Nothing records uploads, seals, processing results or webhook deliveries, so there is no way to see how many apps use WebP, how often processing fails, or whether webhooks reach their receivers.
- **The media lifecycle writes almost no logs.** Upload, seal, settling, `media.publish` and webhook delivery log only their errors and the `webp skipped` and `thumbnail skipped` lines. A job's `job succeeded` line doesn't say what it made, and a `webhook.deliver` job's status code and error class live only in the job row's `result`.
- **The dashboard doesn't identify its user.** `apps/web/app/scripts.tsx` starts browser telemetry but never calls `identify`, so dashboard events and server events land on different people.

The request handlers in `media/handlers.ts` and `media-settings/handlers.ts` also log `{ err }, err.message` with no `media_id` or `app_id`. They gain both.

### 7.2 How events are sent

- A wrapper in `services/log.ts`, like SendLit's `observability/index.ts`: `captureEvent({ event, source, userId, appId, properties })`.
- **The subject is the account** (the user ID), and `groups: { app: appId }`, so funnels can be read per account and per app. Work with no account (cleanup jobs) reports as `system`, as exceptions do today.
- Events use `dedupe: false`, so every occurrence counts.
- The dashboard calls `identify({ id: userId })` after sign-in, `reset()` on sign-out, and `group("app", appId)` when an app is opened, so browser and server events join.
- **Never sent:** file names, original file names, captions, groups, URLs (signed or not, including webhook endpoint URLs and hosts), secrets and tokens. Only IDs, enums, counts, sizes and durations. The allowlist drops anything else, and tests check the event payloads.

### 7.3 Events

Phase 0 flows (step 0):

| Event                      | When                                                | Properties                                                                                                                                     |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `media.uploaded`           | an upload finishes                                  | `media_id`, `transport` (`form` \| `tus` \| `mcp`), `media_kind`, `size_bytes`, `thumbnail` (`made` \| `skipped` \| `failed`)                  |
| `media.sealed`             | seal commits                                        | `media_id`, `media_kind`, `access`, `webp` (`converted` \| `skipped` \| `failed` \| `none`), `reason`, `duration_ms`, `wait_ms`, `jobs_queued` |
| `media.processing.settled` | a media item's processing status settles            | `media_id`, `media_kind`, `status`, `derivatives` (names), `failed_derivatives` (names), `duration_ms` (seal to settle)                        |
| `media.deleted`            | a delete succeeds                                   | `media_id`, `media_kind`, `temp`                                                                                                               |
| `webhook.delivered`        | a delivery gets a 2xx                               | `job_id`, `endpoint_id`, `event_type`, `attempts_made`, `response_code`, `duration_ms`                                                         |
| `webhook.delivery_failed`  | a delivery fails for good                           | `job_id`, `endpoint_id`, `event_type`, `attempts_made`, `response_code` or `error_class`                                                       |
| `webhook.endpoint_changed` | an endpoint is created, updated, rotated or deleted | `endpoint_id`, `action`                                                                                                                        |
| `media_settings.updated`   | media settings are saved                            | `changed` (setting names), and the new values of `use_webp`, `video_streaming`, `hls_renditions`                                               |

Phase 1:

| Event                          | When                                                           | Properties                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `video.encoded`                | an HLS or MP4 job succeeds                                     | `media_id`, `output` (`hls` \| `mp4`), `remux`, `renditions`, `source_duration_s`, `source_height`, `video_codec`, `duration_ms`, `size_bytes`, `minutes_charged` |
| `video.encode_failed`          | an HLS or MP4 job fails for good                               | `media_id`, `output`, `failed_reason`, `source_duration_s`, `video_codec`                                                                                         |
| `processing_minutes.exhausted` | a job is refused for lack of minutes, once per account a month | `plan`, `minutes_used`, `minutes_allowed`                                                                                                                         |

Posters get a log line, not an event (7.4).

`processing_minutes.exhausted` is the upgrade signal. Playback isn't an event: public HLS is served by the CDN and never reaches the API, so counting only private playlist requests would mislead. Playlist requests are logged instead (7.4).

### 7.4 Logs

Phase 0 flows (step 0). Every line carries `media_id` and `app_id` where they apply:

| Message                   | Level | Extra fields                                                                       |
| ------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `upload finished`         | info  | `transport`, `media_kind`, `size_bytes`, `duration_ms`                             |
| `seal committed`          | info  | `webp`, `reason`, `duration_ms`, `wait_ms`, `jobs_queued`                          |
| `seal failed`             | warn  | `reason` (`claim_lost`, `media_gone`, `storage`, `timeout`)                        |
| `derivative recorded`     | info  | `derivative`, `status`, `size_bytes`, `error`                                      |
| `derivatives published`   | info  | `count`, `duration_ms`                                                             |
| `processing settled`      | info  | `status`, `failed_derivatives`                                                     |
| `webhook delivered`       | info  | `endpoint_id`, `response_code`, `duration_ms`, `attempts_made`                     |
| `webhook delivery failed` | warn  | `endpoint_id`, `response_code` or `error_class`, `attempts_made`, `next_run_in_ms` |
| `media settings updated`  | info  | `changed`                                                                          |

Phase 1:

| Message                        | Level | Extra fields                                                                                                                      |
| ------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `metadata read`                | debug | `media_kind`, `duration_ms`                                                                                                       |
| `metadata probe failed`        | warn  | `reason` (`timeout`, `unreadable`, `failed`)                                                                                      |
| `video encode finished`        | info  | `output`, `remux`, `renditions`, `source_duration_s`, `duration_ms`, `speed` (source seconds per wall-clock second), `size_bytes` |
| `video source refused`         | info  | `failed_reason`, `size_bytes`, `source_duration_s`, `source_height`                                                               |
| `poster made`                  | info  | `frame_time_s`, `fallback` (every candidate frame was black)                                                                      |
| `processing minutes reserved`  | info  | `minutes`, `minutes_used`, `minutes_allowed`                                                                                      |
| `processing minutes released`  | info  | `minutes`, `reason`                                                                                                               |
| `processing minutes exhausted` | info  | `minutes_needed`, `minutes_used`, `minutes_allowed`                                                                               |
| `hls playlist served`          | debug | `rendition`, `segments`, `duration_ms`                                                                                            |
| `hls playlist refused`         | info  | `reason` (`expired`, `bad_token`, `not_found`, `rate_limited`)                                                                    |

ffmpeg's stderr is never logged in full. On failure, the last 2 KB go into the job's `last_error`, with URLs and the work directory's path stripped (phase 0: errors are shortened, with no URLs).

### 7.5 Exceptions

The runner already raises `worker.<job_type>.failed` for jobs that fail for good. For video jobs, a failure caused by the tenant's input isn't ours to fix and would drown out real problems:

- **No exception** for `bad_input`, `source_too_long`, `source_too_large`, `no_video_stream` and `out_of_processing_minutes`. They are logged, sent as `video.encode_failed`, and shown on the media.
- `critical` for `db`, `storage` and `internal`, as today. ffmpeg killed by `prlimit` or a crash with a signal counts as `internal`: an input we accepted brought the encoder down. At a few videos a day, one exception per such failure is the alert; there is no separate failure-spike alert for video.
- New source `api.hls_playlist` (`error`) when signing or rewriting a playlist throws.
- New source `api.metadata_probe` (`warning`) when ffprobe crashes or is killed, not when it just can't read a file.

### 7.6 Alerts

Added to the phase 0 checks, with the same paging and 30-minute cooldown:

| Code              | Checked by | Condition                                                                                                                                                                                                                                                             |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `video_queue_lag` | worker     | the oldest queued `video` job is more than 6 hours old. One encode of a long video takes one to two hours (D4), so a shorter limit would page for normal work. `jobs_queue_lag` (10 minutes) excludes the `video` class. The 6 hours is revisited with the benchmark. |
| `jobs_no_worker`  | API        | as today, now also for the `video` class                                                                                                                                                                                                                              |

### 7.7 Allowlist and failure reasons

- New allowlisted properties: `transport`, `media_kind`, `access`, `size_bytes`, `thumbnail`, `webp`, `jobs_queued`, `derivative`, `derivatives`, `failed_derivatives`, `endpoint_id`, `event_type`, `response_code`, `error_class`, `action`, `changed`, `use_webp`, `video_streaming`, `hls_renditions`, `output`, `remux`, `renditions`, `rendition`, `segments`, `source_duration_s`, `source_height`, `video_codec`, `speed`, `minutes`, `minutes_needed`, `minutes_used`, `minutes_allowed`, `minutes_charged`, `plan`, `frame_time_s`, `fallback`, `temp`, `next_run_in_ms`.
- `endpoint_id` joins `identifierKeys`, next to `media_id`, `job_id` and `app_id`.
- New `failed_reason` values: `out_of_processing_minutes`, `source_too_long`, `source_too_large`, `no_video_stream`. Bad input stays `bad_input`. A video job's timeout is `timeout`, as for other jobs.
- The `jobs` operator tool gains `jobs minutes <userId>` (this month's usage rows) and shows `source_duration_s` and `speed` in `jobs show` for video jobs.

## 8. Deployment and testing

- **Images:** no change. `ffmpeg` and `ffprobe` are already in the API image.
- **Infra** (QA and prod, one worker replica each):
    - Worker resources from 1 CPU and 512 MiB to `limits: { cpu: "2", memory: 2Gi, ephemeral-storage: 5Gi }` (D4). Check that the nodes have room for it next to the API and the web app.
    - `WORKER_CONCURRENCY_VIDEO=1` and `VIDEO_MAX_MEMORY_MB=1536`, below the 2 GiB limit.
    - CORS on both buckets and the CloudFront distribution (D6), done by hand and written down in the infra README.
    - The shutdown grace stays at 20 s. A deploy during an encode restarts it from the start without using an attempt (section 2). That is acceptable at our volume, and releases can avoid times when a long encode is running.
- **`.env.example`:** `WORKER_CONCURRENCY_VIDEO`, `VIDEO_MAX_SOURCE_BYTES`, `VIDEO_MAX_DURATION_SECONDS`, `VIDEO_MAX_MEMORY_MB`, `PROCESSING_MINUTES_FREE`, `PROCESSING_MINUTES_PAID`.
- **Self-hosting docs:** worker sizing for 1 GB sources (2 CPU, 2 GiB, 5 GiB of temp disk) and the bucket CORS settings for MinIO and S3.
- **Docs:** media settings (with the plan defaults), playing HLS and MP4, the player component, processing minutes, worker sizing for self-hosting, and the changelog: sealed videos now go through `processing` and fire webhooks, and their thumbnail can change after seal.
- **Tests:**
    - Unit tests for the rendition ladder (no upscaling, portrait, sources smaller than every rendition), the remux check, the frame pick, playlist rewriting and tokens, and minute reservation (two jobs racing for the last minutes, retries not charged twice, release on failure).
    - Integration tests with small generated videos (ffmpeg `testsrc` and `sine`, a few seconds each, at 360p, 720p and portrait, with and without audio, H.264 and VP9):
        - each `videoStreaming` value queues the right jobs, and existing apps stay `"off"` after the migration;
        - HLS for public media: the master playlist and every segment are fetchable from the public bucket, renditions are capped at the source;
        - HLS for private media: the playlist routes serve rewritten playlists whose segments are fetchable, a wrong or expired token gets 403, and the private bucket isn't readable without them;
        - MP4: an H.264/AAC source is remuxed (bytes of the streams unchanged, `moov` before `mdat`), a VP9 source is re-encoded;
        - the poster replaces `thumb.webp` in the public bucket, and a video starting with black frames gets a non-black poster;
        - metadata is returned through REST, MCP and the CLI, and a probe that fails still seals;
        - out of minutes fails the `hls` derivative with the reason, settles the media `ready`, and sends `media.processing.ready` with the failed derivative in its payload; the original still plays;
        - a failed poster settles the media `ready` and keeps the upload thumbnail, and any other failed derivative still settles it `failed`;
        - HLS refused with `source_too_large` or `source_too_long` settles the media `ready`, and a corrupt video that ffmpeg can't decode settles it `failed`;
        - deleting media during an encode kills ffmpeg and leaves nothing in either bucket;
        - each event in 7.3 is sent once per occurrence with only allowlisted properties, and no payload contains a file name, URL, host or secret (checked with a capture client in tests);
        - a video refused for bad input, length or minutes raises no exception, and an encoder killed by `prlimit` raises a `critical` one;
        - `video_queue_lag` pages for an old `video` job, and `jobs_queue_lag` doesn't;
        - a source over the duration limit or `VIDEO_MAX_SOURCE_BYTES` fails permanently with the reason, and the over-size one is never downloaded;
        - an MP4 with its index at the end encodes correctly from the downloaded copy, and ffmpeg is never given a URL;
        - a poster job that finishes before seal's cleanup step still ends up in the public `thumb.webp` (forced with the seal test hooks);
        - a retried HLS attempt leaves no segments from the earlier attempt;
        - ffmpeg exiting with an error fails the job without a retry, and ffmpeg killed by a signal retries;
        - the reconciler releases the minutes of an encode whose worker died on the last attempt;
        - a free-plan video job queued before a paid-plan one runs after it;
        - a private playlist token is still accepted after `CDN_MAX_AGE` and before the video's duration plus `CDN_MAX_AGE`, and an invalid token is refused without a database query.
    - The AGENTS.md end-to-end checks (REST form-data and tus, browser, CLI) pass with the worker running. For videos, also check that the HLS derivative plays through `@medialit/react` **in Chrome** (hls.js, which needs the bucket CORS) and in Safari (native), for both public and private media, with a source close to 1 GB.
    - **Benchmark** on the QA worker in steps 4 and 5: encode speed for 720p and 1080p sources of 10 and 60 minutes. It sets the timeout factor (D4), `video_queue_lag` (7.6) and the paid plan allowance (section 12).

## 9. Rollout

- The migration sets every existing app to `"off"`, so nothing changes for them until they opt in.
- **Deploy order:** worker first, then the API. An old worker that sees a new job type it doesn't know leaves it queued (it only claims registered types), so the order matters less than in phase 0.
- **Rollback:** the old API ignores the new columns and table. An old worker leaves the new job types queued, and a queued job counts as live, so the reconciler never fails their derivatives, and the media would stay `processing` for good. After rolling back the worker, cancel them with `jobs cancel --type <type> --status queued --yes` for each new type (`media.poster`, `media.mp4`, `media.hls`). The reconciler then fails their derivatives and settles the media within 15 minutes.

## 10. Order of work

0. **Observability for phase 0's flows** (7.1 to 7.4): the event wrapper, the events and logs for upload, seal, settling, publishing, webhooks and settings, the dashboard's `identify`, and the handler log context. Small, independent of the rest, and it gives a baseline before videos start going through processing.
1. **Settings and minutes:** the two settings with plan defaults and the migration, REST, MCP, the new `medialit settings` CLI command, the dashboard Media section, and processing-minute metering (D8). Nothing queues jobs yet.
2. **#267 metadata** at seal (D2), and the `metadata` response field.
3. **#265 posters** (D9), the `publicKey` destination in `media.publish`, the `video` class (D3), and the worker's new resources in the infra repo. The first derivative job: sealed videos start firing webhooks. The settling rule from D12 lands here.
4. **#264 MP4** (D7). Smaller than HLS, and it proves the shared video job code (D4): the size check, the download, the retry rules and the timeout. The first benchmark runs here.
5. **#139 HLS** (D5, D6), the bucket CORS settings, then the player (D13). The benchmark is repeated for the ladder.
6. **#266 audio extraction** (D10), unqueued until phase 2.

Each later step ships its own events, logs, exceptions and alerts from section 7, not as a separate step at the end. Steps 4 and 5 depend on 1 to 3. Steps 4 and 6 can run in parallel with 5.

## 11. Out of scope

- Reprocessing media that was sealed before a setting changed (#247: later).
- HLS and MP4 together (#264, open question). If clients ask, add `mp4Fallback: boolean`.
- Audio-only HLS, thumbnails for scrubbing (removed from #265), and image resizing (#263, closed).
- Buying extra minutes.
- Metering images and documents (#247, open decision). Phase 1 meters only video encodes.
- **Processing sources over 1 GB.** Paid uploads can be up to 2 GB; larger videos keep their original and poster and fail HLS or MP4 with `source_too_large`. Raising `VIDEO_MAX_SOURCE_BYTES` needs a bigger worker, not code changes.
- `1440p` and `2160p` renditions (D1).

## 12. Open decisions

1. **Paid plan allowance.** Default `PROCESSING_MINUTES_PAID` to 300 until the HLS encoding benchmark is done? The benchmark runs on the QA worker with step 5.
2. **The free plan's default.** #247 says HLS is on by default for OSS and the paid plan. This doc reads that as `"off"` for the free plan, so free accounts don't spend their 5 minutes on their first upload without asking for it.
3. **Audio extraction in phase 1 or phase 2.** It has no caller until captions. Building it in phase 1 (as #258 says) means unused code for a while. Moving it to the start of phase 2 means it ships with its first user. Proposal: phase 2.
4. **Metadata at seal vs. as a job** (D2). Inline adds up to a few hundred milliseconds per video seal, up to 5 s for a slow source. Needed before step 2.

Decision 2 is needed before step 1. #247 still says to send the failure webhook when minutes run out; it is updated once D12 is approved here.
