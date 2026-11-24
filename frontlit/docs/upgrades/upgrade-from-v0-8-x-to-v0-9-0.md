---
title: "Upgrade from v0.8.x to v0.9.0"
description: "Process videos on the worker: posters, MP4 for the web and HLS streaming"
slug: upgrade-from-v0-8-x-to-v0-9-0
nav_order: 10
---

MediaLit v0.9.0 processes sealed videos on the worker: it picks a better poster, and it can make an MP4 optimized for the web or HLS streams with adaptive bitrate. The worker needs more CPU, memory and disk for that, and HLS in browsers other than Safari needs CORS on your storage. Read this before you upgrade.

## What changes

- **Sealed videos get a poster.** The worker picks a frame from about 10% into the video, skipping dark frames, and publishes it over the video's thumbnail, so saved `thumbnail` URLs show it with no change. A sealed video is now `processing` until its poster is made, and a `media.processing.ready` [webhook](/docs/webhooks) fires when it is. See [Image processing](/docs/concepts#image-processing).
- **Videos can be streamed.** The new `videoStreaming` setting makes HLS (`hls`), an MP4 optimized for the web (`mp4`) or nothing more (`off`), and `hlsRenditions` picks the HLS sizes. See [Video streaming](/docs/concepts#video-streaming) and [`MediaLitVideo`](/docs/react#medialitvideo) to play them.
- **Video streaming is off until you turn it on for an app.** Every app, existing or new, starts with `videoStreaming` set to `off`, so nothing is encoded until you choose a format for that app. Each app has its own setting; there is no server-wide default. Change it under **App settings** > **Media** in the dashboard, or with the SDK, CLI, REST API or MCP server.
- **Media responses gain `metadata`**: the kind, duration, size, rotation and codecs of a file, read when it is sealed. See [Processing status and derivatives](/docs/concepts#processing-status-and-derivatives).
- **Thumbnail sizes are no longer a setting.** Every app gets the standard thumbnails: 16:9 and at most 480 pixels tall for images, 720 pixels tall for videos. Apps that set `thumbnailWidth` and `thumbnailHeight` get the standard size for files uploaded from now on; thumbnails already made don't change. The API ignores the two fields if a client still sends them.
- **WebP quality defaults to 80.** An app that turned WebP on without a quality used to convert at quality 0. A quality you set must now be from 1 to 100.
- **The dashboard's App settings has tabs**: General, API keys, Media and Webhooks.
- **A new alert, `video_queue_lag`,** fires when a video job waits more than 6 hours. See [Alerts](/docs/self-hosting#alerts).

## 1. Back up the database

With the bundled PostgreSQL service:

```sh
docker compose exec -T postgres pg_dump -U medialit medialit > medialit-before-0.9.0.sql
```

## 2. Give the worker room for video

Give the worker the CPU, memory and temporary disk listed in [Size the worker for video](/docs/self-hosting#size-the-worker-for-video). With Docker Compose on a single server the worker shares the server's resources, so check that the server has that much to spare. On Kubernetes, raise the worker's limits, including `ephemeral-storage`.

## 3. Allow CORS on your storage

Skip this if you use the bundled MinIO, or if no app will use `hls`. Browsers other than Safari read HLS segments with `fetch`, so S3, R2 and CloudFront need a CORS rule. See [Allow players to read video segments](/docs/self-hosting#allow-players-to-read-video-segments).

## 4. Upgrade

```sh
docker compose pull
docker compose up -d
```

The `init` service runs the migrations before the API and the worker start. If you run the image without Docker Compose, run `bun apps/api/src/db/migrate.ts` with the new image first, then start the worker and the API.

## 5. Check it worked

1. `docker compose exec medialit-worker bun apps/api/scripts/jobs.ts workers` lists the worker with the classes `cpu,io,video`.
2. Upload a video and seal it. Its `processing.status` is `processing`, then `ready` within a minute or so, and `derivatives.thumbnail` is `ready`.
3. Turn on `hls` for a test app under **App settings** > **Media**, seal a video in it and play it in the dashboard's preview once `derivatives.hls` is `ready`.

## Roll back

v0.8.x ignores the new columns and table. Before you go back, cancel the video jobs that haven't run, because a v0.8.x worker can't run them and they would keep their videos `processing`:

```sh
docker compose exec medialit-worker bun apps/api/scripts/jobs.ts cancel --type media.poster --yes
docker compose exec medialit-worker bun apps/api/scripts/jobs.ts cancel --type media.mp4 --yes
docker compose exec medialit-worker bun apps/api/scripts/jobs.ts cancel --type media.hls --yes
```

Then run the v0.8.x image for the API and the worker. Within 15 minutes the worker marks the cancelled derivatives failed and settles their videos. Apps that set a thumbnail size use it again.
