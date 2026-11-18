---
title: "Upgrade from v0.6.x to v0.7.0"
description: "Move a self-hosted MediaLit installation to uploads that stream straight to your bucket"
slug: upgrade-from-v0-6-x-to-v0-7-0
nav_order: 30
---

MediaLit v0.7.0 streams uploads from the client straight into your private bucket as S3 multipart uploads, instead of writing them to the server's disk first. Big uploads no longer need disk space on the server, and a resumable upload can continue on any API instance.

Because the parts of an unfinished upload now live in your bucket, the bucket needs a lifecycle rule that removes them if MediaLit doesn't. Add it before you upgrade.

## What changes

- **Uploads no longer use the server's disk.** `TEMP_FILE_DIR_FOR_UPLOADS` is now only a working folder for thumbnails and WebP conversion.
- **Unfinished uploads are kept in your bucket** until they finish or are aborted. MediaLit aborts them when they expire, and the bucket's lifecycle rule catches any it misses.
- **Resumable uploads must declare their size when they start.** [`@medialit/uploader`](/docs/other-frameworks), [`@medialit/react`](/docs/react), the [CLI](/docs/cli) and `tus-js-client` with a known file size already do. A tus client that defers the length gets a 400 with `Upload-Length is required`.
- **Requests no longer time out after five minutes.** A connection is closed only after `REQUEST_IDLE_TIMEOUT_MS` (2 minutes) with no data, so big uploads on slow links can finish.
- **Regular uploads are capped per API process** by `MAX_CONCURRENT_FORM_UPLOADS` (16). Over the cap, the API answers 503 with a `Retry-After` header.
- **An upload counts toward storage from the moment it starts.** If the server crashes mid-upload, the upload is cleaned up and its storage freed after `UPLOAD_STALE_MINUTES` (30).

All the new settings are optional and have defaults. See [Tune upload streaming](/docs/self-hosting#tune-upload-streaming).

## 1. Back up the database

With the bundled PostgreSQL service:

```sh
docker compose exec -T postgres pg_dump -U medialit medialit > medialit-before-0.7.0.sql
```

The migrations add a column to `media` and remove two columns from `tus_uploads`. Migrations can't be rolled back, so a backup is the only way back to v0.6.x.

## 2. Add the lifecycle rule to your private bucket

On AWS S3, add a rule that aborts incomplete multipart uploads 7 days after they start. The commands are in [Clean up unfinished uploads](/docs/self-hosting#clean-up-unfinished-uploads). Check the bucket's existing rules first, because applying a lifecycle configuration replaces them.

Cloudflare R2 buckets already have such a rule, and MinIO, including the bundled one in Docker Compose, cleans up unfinished uploads on its own. If you use either, check that the rule or setting is still in place and go to step 3.

## 3. Let resumable uploads finish

Resumable uploads in progress during the upgrade can't be resumed afterwards, because their parts are on the old server's disk. Clients that try get a 404 and start the upload again from the beginning. If you can, upgrade when few uploads are running.

## 4. Upgrade

```sh
docker compose pull
docker compose up -d
```

The `init` service runs the migrations before the API starts. If you run the image without Docker Compose, run `bun apps/api/src/db/migrate.ts` with the new image before starting the API.

## 5. Check it worked

1. Upload a file, for example with the [CLI](/docs/cli): `medialit upload ./photo.png --endpoint https://medialit.example.com`. It should print the file's URL.
2. Upload something big enough to take a few seconds, then press Ctrl+C halfway. On AWS S3, `aws s3api list-multipart-uploads --bucket your_private_bucket_name` shows that upload's parts until MediaLit or the lifecycle rule aborts it. A regular upload is aborted within `UPLOAD_STALE_MINUTES`. A resumable upload is kept until it expires, so the client can still finish it.
3. If you serve videos, upload a short video and check that it gets a thumbnail. MediaLit now makes video thumbnails by reading the video from the bucket through `CLOUD_ENDPOINT`, so the API must be able to reach that address.
