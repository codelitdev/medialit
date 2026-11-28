---
title: "Self hosting"
description: "Learn how to host MediaLit API "
slug: self-hosting
nav_order: 10
---

This guide explains how to self-host MediaLit with an S3-compatible storage provider. Files are stored in your own buckets, and your apps, agents, the dashboard and the CLI talk to your server instead of medialit.cloud.

To run everything on one machine, use [Docker Compose](#run-with-docker-compose). To store files with AWS S3, Cloudflare R2 or your own MinIO instead of the bundled MinIO, see [Configuring storage](#configuring-storage).

## Run with Docker Compose

The [`docker-compose.yml`](https://github.com/codelitdev/medialit/blob/main/docker-compose.yml) in the MediaLit repository starts the whole stack:

- the API and the dashboard
- the worker, which runs background jobs
- PostgreSQL
- MinIO for file storage, with a private `medialit` bucket and a public `medialit-public` bucket created on first start
- Mailpit, which catches the sign-in emails
- Caddy, a reverse proxy on port 80 that routes each hostname to the right service

### Try it on your computer

```sh
git clone https://github.com/codelitdev/medialit.git
cd medialit
cp .env.example .env
docker compose up
```

The values in `.env.example` work as they are:

| What                     | Address                       |
| ------------------------ | ----------------------------- |
| Dashboard                | `http://app.localtest.me`     |
| API                      | `http://api.localtest.me`     |
| MCP server               | `http://api.localtest.me/mcp` |
| Sign-in emails (Mailpit) | `http://localhost:8025`       |

Sign in to the dashboard with the `EMAIL` from `.env`, which is `admin@example.com` by default, and read the code in Mailpit.

To use the [CLI](/docs/cli), run `medialit login --endpoint http://api.localtest.me`.

### Upload a test file

1. In the dashboard, open your app (named **My Store** at first) and go to **Settings**. Under **API keys**, choose **Create key** and copy the key. It is shown only once.
2. Upload a file. Replace `YOUR_API_KEY` with the key you copied:

    ```sh
    echo "hello from MediaLit" > test.txt
    curl -X POST http://api.localtest.me/media/create \
      -H "x-medialit-apikey: YOUR_API_KEY" \
      -F "file=@test.txt;type=text/plain" \
      -F "access=private"
    ```

    The response is the new file. Note its `mediaId`.

3. Seal the file. Uploads stay temporary, and are deleted after a while, until you [seal](/docs/concepts#temporary-uploads-and-sealing) them:

    ```sh
    curl -X POST http://api.localtest.me/media/seal/YOUR_MEDIA_ID \
      -H "x-medialit-apikey: YOUR_API_KEY"
    ```

4. In the dashboard, open the app's **Files** tab. The file appears there.

<Callout>
`localtest.me` is a public domain that always resolves to `127.0.0.1`, so your computer needs a working internet connection to look it up. Do not use `localhost` or `*.localhost` instead: inside the containers those names point to the container itself, and the API must reach its own public address to verify sign-ins from MCP clients and the CLI.
</Callout>

`.env.example` sets `NODE_ENV=development`, which lets the API run on plain `http://` URLs. It also turns off rate limiting on sign-in and writes sign-in codes to the API's log. Use it only on your computer.

### Run it on a server

1. Point three hostnames at your server with DNS records, for example `medialit.example.com` for the API, `app.medialit.example.com` for the dashboard and `s3.medialit.example.com` for file downloads.
2. Copy `.env.example` to `.env` and change it:
    - Set `SITE_ADDRESS`, `WEB_SITE_ADDRESS` and `S3_SITE_ADDRESS` to the three hostnames.
    - Set `PUBLIC_API_URL` and `WEB_ORIGIN` to the `https://` addresses of the API and the dashboard.
    - Delete the `NODE_ENV` line.
    - Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 48`, and choose your own `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.
    - Set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` and `EMAIL_FROM` to your SMTP server, and remove the `mailpit` service from `docker-compose.yml`.
3. In `docker-compose.yml`, change the three `http://` storage URLs (`CLOUD_ENDPOINT`, `CLOUD_ENDPOINT_PUBLIC` and `CDN_ENDPOINT`) to `https://`. Browsers open file links from these URLs, and an `https://` dashboard does not load files from `http://` links.
4. Put a reverse proxy that handles HTTPS in front of Caddy, for example your load balancer or a Caddy or nginx instance on the host. Forward all three hostnames to port 80 and keep the original `Host` header, because Caddy routes requests by hostname. If your proxy needs port 80 on the same server, publish Caddy on another port, for example `"8080:80"`.
5. Run `docker compose up -d`.

PostgreSQL is published only on `127.0.0.1:5433` and uses the default password `medialit`. Keep it that way: do not open port 5433 in your firewall or publish it on all interfaces.

The API does not start without HTTPS: in production it refuses `http://` URLs in `PUBLIC_API_URL`.

## Configuring storage

The Docker Compose setup stores files in its bundled MinIO. To use another provider, replace the MinIO settings of the `medialit` service in `docker-compose.yml` with the values from the steps below.

### Requirements

1. Two buckets: one dedicated to private files and one to public files.
2. Private bucket access settings: public access disabled.
3. Public bucket access settings: public access enabled.
4. A lifecycle rule on the private bucket that aborts incomplete multipart uploads after 7 days. See [Clean up unfinished uploads](#clean-up-unfinished-uploads).

### Clean up unfinished uploads

MediaLit streams every upload into the private bucket as an S3 multipart upload. If a client gives up halfway, its uploaded parts stay in the bucket, and cost storage, until the upload is aborted. They don't show up as files, so you won't see them when you browse the bucket. MediaLit aborts unfinished uploads when they expire, and a lifecycle rule on the bucket catches any it misses, for example after a crash.

The rule must wait longer than a resumable upload stays resumable, which is `SIGNATURE_VALIDITY_MINUTES` (1 day by default). Otherwise the bucket aborts uploads that a client could still finish. 7 days leaves plenty of room.

**AWS S3**

Save this as `lifecycle.json`:

```json
{
    "Rules": [
        {
            "ID": "abort-incomplete-multipart-uploads",
            "Status": "Enabled",
            "Filter": {},
            "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
        }
    ]
}
```

Check that the private bucket has no lifecycle rules yet:

```sh
aws s3api get-bucket-lifecycle-configuration --bucket your_private_bucket_name
```

If it says `NoSuchLifecycleConfiguration`, apply the rule:

```sh
aws s3api put-bucket-lifecycle-configuration \
    --bucket your_private_bucket_name \
    --lifecycle-configuration file://lifecycle.json
```

<Callout type="warning" title="This replaces the bucket's existing rules">
    `put-bucket-lifecycle-configuration` overwrites every lifecycle rule on the bucket. If the bucket already has rules, add the rule above to the `Rules` list that `get-bucket-lifecycle-configuration` printed, and apply the whole list.
</Callout>

Run `get-bucket-lifecycle-configuration` again to check that the rule is there. To do the same in the AWS console, open the bucket's **Management** tab and create a lifecycle rule that applies to all objects and deletes incomplete multipart uploads 7 days after they start.

To see unfinished uploads waiting in the bucket:

```sh
aws s3api list-multipart-uploads --bucket your_private_bucket_name
```

A resumable upload a client is still working on shows up here too, until it finishes or expires.

**Cloudflare R2**

Every R2 bucket has a default rule that aborts incomplete multipart uploads 7 days after they start, so there's nothing to set up. Check that the bucket still has it under **Settings** > **Object lifecycle rules**.

**MinIO**

MinIO removes unfinished multipart uploads on its own, 24 hours after they start by default. If you raise `SIGNATURE_VALIDITY_MINUTES` above 1 day, raise MinIO's limit to match, or MinIO removes uploads that a client could still finish:

```sh
mc admin config set your_minio_alias api stale_uploads_expiry=168h
```

The same setting can be passed to the MinIO server as `MINIO_API_STALE_UPLOADS_EXPIRY=168h`.

### AWS S3

**1. Configure the private bucket**

![AWS Private bucket private access](https://cdn.medialit.cloud/medialit-service/p/kxkdGqwymyM-BGTdmzIZ0e4SxZs55tXMugvcic-g/main.png)

**2. Configure the public bucket**

**2.1 Allow public access**

![AWS Public bucket public access](https://cdn.medialit.cloud/medialit-service/p/aeKhGcJv105kDM4n8rUuin__kx3pU7UiMC1JXBjP/main.png)

**2.2 Configure bucket policy**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadAccess",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::<bucket>/<path-prefix>/*"
        }
    ]
}
```

**3. Set environment variables**

```sh
CLOUD_KEY=your_aws_access_key
CLOUD_SECRET=your_aws_secret_key
CLOUD_BUCKET_NAME=your_bucket_name
CLOUD_PUBLIC_BUCKET_NAME=your_public_bucket_name
CLOUD_REGION=us-east-1
CDN_ENDPOINT=https://<bucket-name>.s3.<region>.amazonaws.com
```

#### Add CloudFront CDN

**1. CloudFront distribution configuration**

Add the public bucket to CloudFront as an origin.

**2. Set environment variables**

```sh
CDN_ENDPOINT=https://your-cloudfront-endpoint.example.com
```

In this setup, private URLs are served directly from S3. To serve private bucket content via CloudFront as well, keep reading.

**3. Put the private bucket behind CloudFront**

**3.1. Add the private bucket to CloudFront**

Add the private bucket to CloudFront as an origin.

![Put both buckets behind CloudFront](https://cdn.medialit.cloud/medialit-service/p/Ml3cmzuRe956VaZa6ndA4nz25Qd4WEuloJEPJ07q/main.png)

**3.2. Set environment variables**

```
ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT=true # Enables URL signing for CloudFront
CLOUDFRONT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENTS\n-----END PRIVATE KEY-----"
CLOUDFRONT_KEY_PAIR_ID=YOUR_KEY_PAIR_ID
```

### Cloudflare R2

**1. Configure the private bucket**

![Cloudflare R2 private bucket config](https://cdn.medialit.cloud/medialit-service/p/32_vo3QSWkW3nVxBw4y7MvJpNqT77ryzIed2PbJK/main.png)

**2. Configure the public bucket**

![Cloudflare R2 public bucket config](https://cdn.medialit.cloud/medialit-service/p/ezqHRIPNorZOwWC_o-0Wo_Uzk91Df05-iA5qANvj/main.png)

**3. Set environment variables**

```sh
CLOUD_KEY=your_cloudflare_r2_access_key
CLOUD_SECRET=your_cloudflare_r2_secret_key
CLOUD_BUCKET_NAME=your_private_bucket_name
CLOUD_PUBLIC_BUCKET_NAME=your_public_bucket_name
CLOUD_REGION=auto
CLOUD_ENDPOINT=https://<your-account-id>.r2.cloudflarestorage.com
CLOUD_ENDPOINT_PUBLIC=https://<your-account-id>.r2.cloudflarestorage.com # Same URL as CLOUD_ENDPOINT
CDN_ENDPOINT=https://<your-cdn-endpoint>.r2.dev # For accessing public bucket content
DISABLE_TAGGING=true
```

> In the Cloudflare setup, you cannot serve private bucket content through the CDN.

### Minio

Minio by default uses Path Style (e.g. `https://minio-api.example.com/bucket-name`) while MediaLit/AWS S3 uses Virtual Hosted Style (e.g. `https://bucket-name.minio-api.example.com`)

In order for Minio to be used as object storage backend for MediaLit, additional DNS entry and certificates need to be generated.

**1. Configure Reverse Proxy**

A reverse proxy route for `*.minio-api.example.com` need to be created for Minio API.

Below example uses Traefik IngressRoute in Kubernetes to create a new Ingress route. Adjust accordingly for your Reverse Proxy:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
    name: minio-api
spec:
    entryPoints:
        - websecure
    routes:
        - match: Host(`minio-api.example.com`)
          kind: Rule
          services:
              - name: minio-api
                port: 9000
        - match: HostRegexp(`^.+\.minio-api\.example\.com$`)
          kind: Rule
          services:
              - name: minio-api
                port: 9000
---
kind: Service
apiVersion: v1
metadata:
    name: minio-api
spec:
    type: ExternalName
    ports:
        - name: http
          port: 9000
    externalName: <ip address of minio VM>
```

**2. Configure DNS:**
The following 2 DNS entries need to be created in DNS provider:

| DNS Name                 | Record Type | IP Address       |
| ------------------------ | ----------- | ---------------- |
| minio-api.example.com    | A           | Reverse Proxy IP |
| \*.minio-api.example.com | A           | Reverse Proxy IP |

**Certificates:**

Additional SSL certificate for wildcard subdomain need to be created either in Minio VM (e.g CertBot), or in reverse proxy when using SSL termination.

Below example uses Cert Manager in Kubernetes to issue new certificate for reverse proxy.

Adjust accordingly for your reverse proxy or Minio VM certificate generator of choice.

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
    name: cluster-certificate
    namespace: cert-manager
spec:
    secretName: cluster-certificate-tls
    issuerRef:
        name: cloudflare-issuer
        kind: ClusterIssuer
    commonName: "*.example.com"
    dnsNames:
        - "*.example.com"
        - "minio-api.example.com"
        - "*.minio-api.example.com"
```

**3. Configure private bucket**

![Minio Private bucket private access](https://cdn.medialit.cloud/medialit-service/p/IN9I1lIvcSPnCf7BLuNU_QQJelVDQFz7HTO4IHnH/main.png)

**4. Configure public bucket**

![Minio Public bucket public access](https://cdn.medialit.cloud/medialit-service/p/Mi3kC9HtENgfB3URq0wfoYGCFD7V1czmvDvPWX0g/main.png)

**5. Set environment variables**

```sh
CLOUD_KEY=your_minio_access_key
CLOUD_SECRET=your_minio_secret_key
CLOUD_BUCKET_NAME=your_private_bucket_name
CLOUD_PUBLIC_BUCKET_NAME=your_public_bucket_name
CLOUD_REGION=your_minio_region
CLOUD_ENDPOINT=https://<your_minio_api_endpoint>
CLOUD_ENDPOINT_PUBLIC=https://<your_minio_api_endpoint> # Same URL as CLOUD_ENDPOINT
CDN_ENDPOINT=https://<your_minio_api_endpoint> # For accessing public bucket content
```

> In the Minio setup, you cannot serve private bucket content through the CDN.

## Run the worker

The worker runs MediaLit's background jobs: publishing sealed files, video posters, MP4 and HLS encodes, webhook deliveries, and cleanup of expired uploads and old job records. It uses the same image and settings as the API, started with a different command:

```yaml
services:
    medialit-worker:
        image: codelit/medialit
        command: ["bun", "apps/api/src/worker.ts"]
        environment: *medialit-env # the API's settings
        stop_grace_period: 15s
```

The `docker-compose.yml` in the repository already has it. If you run the image some other way, for example on Kubernetes, run one or more workers next to the API, against the same database and buckets.

Without a worker, sealed files stay `processing`, videos aren't encoded, webhooks aren't sent, and unsealed uploads stay in your bucket and keep counting toward storage. The API logs `No MediaLit worker is running` a minute after it starts, and every hour after that, while no worker is running. After 5 minutes without a worker it also sends the `jobs_no_worker` [alert](#alerts).

You can run several workers. Each job runs once, on one of them.

| Variable                   | Default          | What it does                                                                                                                                                                                     |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WORKER_PORT`              | `8001`           | Port for `/health` and `/ready`                                                                                                                                                                  |
| `WORKER_CONCURRENCY_CPU`   | one per CPU core | Media processing jobs other than video encodes (posters, for example) run at once                                                                                                                |
| `WORKER_CONCURRENCY_IO`    | `16`             | Cleanup and other network-bound jobs run at once                                                                                                                                                 |
| `WORKER_CONCURRENCY_VIDEO` | `1`              | Video encodes run at once. Each encode uses every core, so keep this at 1 unless the worker has cores to spare                                                                                   |
| `WORKER_CLASSES`           | `cpu,io,video`   | Limit a worker to some kinds of jobs, for example `io`, or `video` for a worker that only encodes. `transcribe` runs captions, on the [transcription worker](#run-the-transcription-worker) only |
| `WORKER_SHUTDOWN_GRACE_MS` | `8000`           | On shutdown, how long running jobs get to finish. Unfinished jobs go back to the queue, and another worker runs them again.                                                                      |

Set your container's stop timeout a few seconds above `WORKER_SHUTDOWN_GRACE_MS`.

## Webhooks

The worker delivers [webhooks](/docs/webhooks). The tenant picks the URL, so MediaLit refuses URLs that resolve to loopback, private, link-local (including cloud metadata such as `169.254.169.254`), CGNAT, multicast and reserved addresses, and their IPv6 forms. It checks every address the hostname resolves to, when the endpoint is saved and before every delivery, and then connects to the address it checked. With `NODE_ENV=production`, only `https` URLs are accepted.

If your receivers run on your own network, for example another service in the same Compose project, set this on the API and the worker:

```sh
WEBHOOK_ALLOW_PRIVATE_NETWORKS=true
```

It turns the address check off and also allows `http` URLs in production. Only set it when everyone who can create an endpoint is trusted: it lets them make the worker send requests to anything it can reach. The worker logs a warning at startup while it is set.

## Operate the job queue

### Alerts

The API and the workers check the job queue every minute. When something is wrong, they log an error with an `alert_code` and email the addresses in `OPERATOR_ALERT_EMAIL` (comma-separated), through the `EMAIL_*` SMTP settings. Each alert emails at most once every 30 minutes, however many API instances and workers you run. Without `OPERATOR_ALERT_EMAIL`, alerts are only logged.

| Alert                  | Means                                                                                                                                   | What to do                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jobs_no_worker`       | No worker has reported for 5 minutes, so nothing is cleaned up. For captions, only while captions are waiting.                          | Start the worker, or read its log to see why it stopped. `jobs workers` shows when each one was last seen.                                       |
| `jobs_queue_lag`       | A job other than a video encode has waited more than 10 minutes to start.                                                               | Check that the workers are running and not stuck. If they are busy, raise their concurrency or add workers.                                      |
| `video_queue_lag`      | A video job has waited more than 6 hours to start.                                                                                      | Video encodes run one at a time and can take an hour or two each. Check the worker, or give it more CPU.                                         |
| `transcribe_queue_lag` | A captions job has waited more than 6 hours to start.                                                                                   | Check the transcription worker. If it is busy all day, give it its own machine or run another one.                                               |
| `captions_volume`      | More than `CAPTIONS_DAILY_MINUTES_ALERT` minutes (default 120) of audio were captioned in the last 24 hours. Emails at most once a day. | Plan capacity: one transcription worker handles about 20 hours of English audio a day on 2 CPUs. Give it its own machine before it falls behind. |
| `jobs_failure_spike`   | More than 10 jobs failed for good in the last 10 minutes.                                                                               | `jobs list --status failed --since 1h` shows why. Fix the cause, often storage or the database, then retry them.                                 |
| `webp_busy`            | Seal skipped WebP because every conversion slot was busy.                                                                               | Images sealed meanwhile kept their original. Raise `WEBP_CONCURRENCY` if the API has spare CPU and memory.                                       |

With `POSTHOG_API_KEY` set, the API and the worker also send their logs and errors to PostHog. A job that fails for good shows there as an exception from `worker.<job type>.failed`.

### The jobs command

The `jobs` command reads and changes the queue. It connects with `DATABASE_URL`, so run it inside a MediaLit container:

```sh
docker compose exec medialit-worker bun apps/api/scripts/jobs.ts stats
```

| Command                                                     | What it does                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `jobs stats`                                                | Jobs by type and status, the oldest waiting job, failures in the last hour, workers |
| `jobs list --status failed --type <type> --since 1h`        | Jobs with the reason they failed                                                    |
| `jobs show <jobId>`                                         | Everything about one job                                                            |
| `jobs media <mediaId>`                                      | The jobs for one file                                                               |
| `jobs retry <jobId>`                                        | Run a failed or cancelled job again, with its attempts reset                        |
| `jobs retry --status failed --type <type> --since 1h --yes` | Run many failed jobs again                                                          |
| `jobs cancel <jobId>`                                       | Cancel a waiting or running job                                                     |
| `jobs cancel --type <type> --yes`                           | Cancel many                                                                         |
| `jobs workers`                                              | Each worker, its job classes, and when it was last seen                             |

Without `--yes`, `retry` and `cancel` with filters only print how many jobs they would change.

### Check the queue with SQL

```sql
-- Jobs waiting, by type
SELECT type, count(*) FROM jobs WHERE status = 'queued' GROUP BY type;

-- How long the oldest job has waited
SELECT now() - min(run_at) FROM jobs WHERE status = 'queued' AND run_at <= now();

-- Failures in the last hour
SELECT type, last_error, finished_at FROM jobs
WHERE status = 'failed' AND finished_at > now() - interval '1 hour'
ORDER BY finished_at DESC;
```

## Set upload limits

The Docker Compose setup runs in OSS mode (`MEDIALIT_DEPLOYMENT_MODE=oss`), where accounts have no upload or storage limits and there is no billing.

With `MEDIALIT_DEPLOYMENT_MODE=cloud`, these variables set the largest file and the total storage per account, in bytes. "Subscribed" applies to accounts with an active paid subscription, which comes only from billing checkout.

```sh
MAX_UPLOAD_SIZE_SUBSCRIBED=2147483648        # 2 GB
MAX_UPLOAD_SIZE_NOT_SUBSCRIBED=52428800      # 50 MB
MAX_STORAGE_ALLOWED_SUBSCRIBED=107374182400  # 100 GB
MAX_STORAGE_ALLOWED_NOT_SUBSCRIBED=1073741824 # 1 GB
TEMP_MEDIA_EXPIRATION_HOURS=24               # unsealed uploads are deleted after this
```

### Tune upload streaming

Uploads stream from the client to the private bucket in parts, without being written to the server's disk first. Each upload holds at most `UPLOAD_PART_SIZE_BYTES` × `UPLOAD_PART_CONCURRENCY` at a time: in memory for regular uploads, and in the system temp folder for resumable uploads.

```sh
UPLOAD_PART_SIZE_BYTES=8388608     # 8 MiB, at least 5 MiB
UPLOAD_PART_CONCURRENCY=2          # parts of one upload sent at the same time
MAX_CONCURRENT_FORM_UPLOADS=16     # regular uploads per API process; more get 503
REQUEST_IDLE_TIMEOUT_MS=120000     # close a connection after 2 minutes with no data
UPLOAD_STALE_MINUTES=30            # free an upload lost in a crash after this long
```

Regular uploads keep their parts in memory, so `MAX_CONCURRENT_FORM_UPLOADS` protects the API process from running out of memory under load. Clients that get a 503 should retry after the `Retry-After` header. Resumable uploads buffer parts on disk instead and aren't counted.

Uploads have no overall time limit: a big file on a slow connection can take as long as it needs, as long as data keeps arriving.

An upload counts toward storage from the moment it starts. If MediaLit restarts in the middle of a regular upload, the upload is cleaned up and its storage freed after `UPLOAD_STALE_MINUTES`. A resumable upload is kept until it expires, so the client can still finish it.

## Limit image conversion

When an app turns WebP on, the API converts each JPEG or PNG image with `cwebp` while it seals it. Images come from your users, so the conversion is bounded. When a limit is hit, the seal still succeeds and keeps the original image, and `processing.error` says why.

```sh
WEBP_MAX_INPUT_BYTES=26214400  # 25 MB: larger images are not converted
WEBP_MAX_PIXELS=50000000       # 50 megapixels, read from the image header without decoding it
WEBP_MAX_MEMORY_MB=1024        # memory limit for each cwebp process
WEBP_TIMEOUT_MS=30000          # a conversion that takes longer is stopped
WEBP_CONCURRENCY=2             # conversions running at once in each API process
WEBP_QUEUE_WAIT_MS=10000       # a seal waits this long for a free slot, then seals without converting
SEAL_CLAIM_MS=120000           # a seal that stops responding for this long is taken over by the next one
SEAL_WAIT_MS=15000             # a second seal of the same file waits this long, then answers 503 so the client retries
```

The memory limit uses `prlimit`, from util-linux, which the MediaLit image includes. On a machine without it, conversions run without a memory limit and the API logs a warning. The image limit also applies to thumbnails: images over `WEBP_MAX_PIXELS` get no thumbnail.

## Allow players to read video segments

Browsers that can't play HLS natively, such as Firefox, play it with hls.js, which reads playlists and segments with `fetch`. That needs CORS on your storage: allow `GET` and `HEAD` from any origin on both buckets. Segment URLs of private videos are signed, so this doesn't open anything up.

Safari and recent versions of Chrome play HLS natively, without CORS. A video that plays in those browsers doesn't show that CORS is set; use the check at the end of this section.

Playlists of private videos are served by the API at `PUBLIC_API_URL`, with CORS for any origin, so viewers' browsers must be able to reach that address.

- **MinIO** allows any origin by default.
- **S3** and **R2**: set a CORS rule on both buckets, for example with the AWS CLI:

```bash
aws s3api put-bucket-cors --bucket <bucket> --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "ETag"],
    "MaxAgeSeconds": 3600
  }]
}'
```

- **Behind CloudFront**, also attach the managed response headers policy `Managed-SimpleCORS` to the distribution's behaviors. Otherwise CloudFront can cache a response without the CORS header and serve it to browsers.

To check, seal a video in an app with `hls` on, and once `derivatives.hls` is `ready`, ask storage for one of its segments with an `Origin` header:

```bash
# derivatives.hls.url from GET /media/get/<mediaId>
MASTER='<master playlist URL>'
VARIANT="${MASTER%/*}/$(curl -s "$MASTER" | grep -v '^#' | grep . | head -1)"
SEGMENT=$(curl -s "$VARIANT" | grep '^http' | head -1)
curl -s -o /dev/null -D - -H 'Origin: https://example.com' "$SEGMENT" | grep -i '^access-control-allow-origin'
```

It prints `access-control-allow-origin: *` when CORS is set. No output means hls.js players can't load the video.

## Size the worker for video

The worker processes sealed videos: posters, and the MP4 or HLS versions the [`videoStreaming`](/docs/concepts#video-streaming) setting asks for. One encode runs at a time (`WORKER_CONCURRENCY_VIDEO`) and uses every core it gets.

For sources up to 1 GB, give the worker about 2 CPUs, 2 GB of memory and 12 GB of temporary disk: the worker downloads the source and writes the output before uploading it. At the bitrate caps, an HLS ladder of 1080p, 720p and 480p takes about 4.3 GB per hour of video. An encode whose source and output wouldn't fit in `VIDEO_MAX_WORK_BYTES` is refused before it starts; the video keeps its original and poster. On 2 CPUs, an hour of 1080p video takes roughly one to two hours to encode.

| Variable                     | Default               | What it does                                                                                                                                                |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_MAX_SOURCE_BYTES`     | `1073741824` (1 GB)   | Larger videos keep their original and poster, and aren't encoded                                                                                            |
| `VIDEO_MAX_DURATION_SECONDS` | `7200` (2 hours)      | Longer videos keep their original and poster, and aren't encoded                                                                                            |
| `VIDEO_MAX_MEMORY_MB`        | `3072`                | Address space ffmpeg may reserve for one encode, a guard against a file that makes it run away. It uses far less: about 0.5 GB for a 4K source at 2 threads |
| `VIDEO_MAX_WORK_BYTES`       | `10737418240` (10 GB) | Temporary disk one encode may use, source and output together. Keep the worker's disk larger                                                                |
| `VIDEO_ENCODE_THREADS`       | `2`                   | Threads per encode. Match the worker's CPUs; more threads only reserve more memory                                                                          |

## Run the transcription worker

[Captions](/docs/concepts#captions) are made by a separate worker, from the `codelit/medialit-transcribe` image: the API image plus Whisper (faster-whisper with the `large-v3-turbo` model, quantized to int8) and its model: about 3.3 GB, of which 1.2 GB are the API image's layers that a server running MediaLit already has. It runs the ordinary worker for the `transcribe` job class only, so it needs the same settings as the API and the other worker. Audio never leaves your server.

In the repository's `docker-compose.yml` it is behind a profile, so it is only pulled when you want captions:

```sh
docker compose --profile captions up -d
```

On Kubernetes, run it as its own deployment with the API's environment. The image sets `WORKER_CLASSES=transcribe`.

Without it, captions jobs wait in the queue, and the media settings report `captionsAvailable: false`. Nothing else changes: files are `ready` without their captions.

One transcription runs at a time and uses every core it is given: give it 2 CPUs and 3 GB of memory. The model is loaded for each job (10 to 20 seconds) and freed when the job ends, so an idle transcription worker uses little memory. On 2 CPUs, an hour of English audio takes about an hour; some languages, such as Hindi, take two to three times as long.

| Variable                        | Default            | What it does                                                                                                                            |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_CONCURRENCY_TRANSCRIBE` | `1`                | Transcriptions at once. Each uses every core, so keep this at 1 and run more workers instead                                            |
| `TRANSCRIBE_THREADS`            | the number of CPUs | Threads per transcription. Set it to the worker's CPU limit when the container sees more cores than it may use                          |
| `CAPTIONS_MAX_DURATION_SECONDS` | `7200` (2 hours)   | Longer files aren't captioned                                                                                                           |
| `CAPTIONS_DAILY_MINUTES_ALERT`  | `120`              | Minutes of audio captioned in 24 hours above which the `captions_volume` alert emails. Counts metered minutes, so OSS mode never alerts |

## Create a key at startup

When another service in the same Docker Compose file uses MediaLit, for example a bundled SendLit, FrontLit or CourseLit, it needs a working key before anyone can open the dashboard. Set `MEDIALIT_BOOTSTRAP_API_KEY` and MediaLit creates that key for the `EMAIL` user's default app every time it starts, before it reports healthy:

```sh
# .env
MEDIALIT_APIKEY=ml_live_<output of: openssl rand -hex 32>
```

```yaml
services:
    medialit:
        environment:
            EMAIL: ${ADMIN_EMAIL}
            MEDIALIT_BOOTSTRAP_API_KEY: ${MEDIALIT_APIKEY}
        healthcheck:
            test: ["CMD", "wget", "-qO-", "http://localhost:8000/health"]
    your-app:
        environment:
            MEDIALIT_APIKEY: ${MEDIALIT_APIKEY}
            MEDIALIT_SERVER: http://medialit:8000
        depends_on:
            medialit: { condition: service_healthy }
```

- The value must be at least 43 characters from `A-Z`, `a-z`, `0-9`, `_` and `-`. MediaLit refuses to start otherwise, and also if `EMAIL` is missing.
- To rotate the key, change the value and restart. MediaLit revokes the old key when it starts with the new one.
- While the key is configured, the dashboard shows it as **Managed by configuration** and can't revoke it. Remove the setting to manage it like any other key.
- MediaLit never writes the key to its logs.

## Point your apps at your server

Set `MEDIALIT_ENDPOINT` wherever you use the [Node.js SDK](/docs/node-sdk):

```sh
MEDIALIT_ENDPOINT=https://medialit.example.com
MEDIALIT_API_KEY=your_api_key
```

If your server reaches MediaLit on a different URL than browsers do, for example inside Docker, pass `publicEndpoint` to [`createSignatureHandler`](/docs/node-sdk#createsignaturehandler). MCP clients connect to `https://medialit.example.com/mcp`, and the [CLI](/docs/cli) logs in with `medialit login --endpoint https://medialit.example.com`.

## Upgrade your server

`docker compose pull && docker compose up -d` upgrades MediaLit. The `init` service applies database migrations before the API starts. If you run the image without Docker Compose, run `bun apps/api/src/db/migrate.ts` with the new image before starting the API.

<Callout type="warning">
  Back up the database before upgrading. Migrations can't be rolled back, and the hashed API keys migration removes plaintext keys for good.
</Callout>

Each version's steps are in the Upgrades section, starting with [v0.8.x to v0.9.0](/docs/upgrade-from-v0-8-x-to-v0-9-0). Follow the guide for every version you pass.

## Monitor your server

Find out that MediaLit is down before your users do.

1. **Uptime:** point an uptime monitor such as Better Stack or UptimeRobot at `https://medialit.example.com/ready`. It returns 200 when the API is running and can reach its database, and 503 otherwise. The worker answers the same way on `/ready` at `WORKER_PORT`, inside your network.
2. **End to end:** run the synthetic check every 2 hours from a machine other than your MediaLit server. It uploads a tiny file, seals it, downloads it and deletes it, so it also catches storage and CDN problems that `/ready` can't see.

```bash
MEDIALIT_APIKEY=your_monitoring_app_key \
MEDIALIT_SERVER=https://medialit.example.com \
MEDIALIT_SYNTHETIC_HEARTBEAT_URL=https://uptime.betterstack.com/api/v1/heartbeat/... \
  npx @medialit/integration-tests@0.2.0 synthetic
```

Create a separate app for monitoring and use its API key: the synthetic check only touches its own files. With a heartbeat URL from Better Stack or Healthchecks.io, you are alerted when a check fails and when checks stop arriving.
