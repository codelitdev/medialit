---
title: "Upgrade from v0.7.x to v0.8.0"
description: "Add the worker service that runs MediaLit's background jobs"
slug: upgrade-from-v0-7-x-to-v0-8-0
nav_order: 40
---

MediaLit v0.8.0 runs its background jobs in a separate worker process instead of the API. The worker uses the same image as the API. Add it before you upgrade.

## What changes

- **A new worker service runs the cleanup** of expired temporary uploads and unfinished uploads. The API no longer does. Without a worker, unsealed uploads stay in your bucket and keep counting toward storage.
- **The cleanup runs once per installation**, however many API instances you run.
- **The job queue can alert you.** Set `OPERATOR_ALERT_EMAIL` to get an email when no worker is running or jobs pile up or fail. See [Operate the job queue](/docs/self-hosting#operate-the-job-queue).
- **The database gets four new tables,** `jobs`, `workers`, `operator_alerts` and `derivatives`, and the `media` table gets columns for processing status. Existing media is marked `ready`.
- **Media responses gain `processing` and `derivatives`.** No existing field changes. See [Processing status and derivatives](/docs/concepts#processing-status-and-derivatives).

## 1. Back up the database

With the bundled PostgreSQL service:

```sh
docker compose exec -T postgres pg_dump -U medialit medialit > medialit-before-0.8.0.sql
```

## 2. Add the worker

If you use the `docker-compose.yml` from the repository, take the new version. It has a `medialit-worker` service.

If you keep your own Compose file, give the API service's `environment` an anchor and add the worker with the same settings:

```yaml
services:
    medialit:
        image: codelit/medialit
        environment: &medialit-env # your existing settings


    medialit-worker:
        image: codelit/medialit
        restart: on-failure
        command: ["bun", "apps/api/src/worker.ts"]
        environment: *medialit-env
        stop_grace_period: 15s
        depends_on:
            init:
                condition: service_completed_successfully
```

On Kubernetes or another platform, add a deployment that runs the API's image with the command `bun apps/api/src/worker.ts` and the API's environment. Point its liveness probe at `/health` and its readiness probe at `/ready`, on port 8001 (`WORKER_PORT`). See [Run the worker](/docs/self-hosting#run-the-worker) for its settings.

## 3. Upgrade

```sh
docker compose pull
docker compose up -d
```

The `init` service runs the migrations before the API and the worker start. If you run the image without Docker Compose, run `bun apps/api/src/db/migrate.ts` with the new image first, then start the worker and the API.

## 4. Check it worked

1. `docker compose logs medialit-worker` shows `Medialit worker running`.
2. A minute after the API starts, its log must not show `No MediaLit worker is running`.
3. Upload a file without sealing it. It is deleted once it is older than `TEMP_MEDIA_EXPIRATION_HOURS` (24 hours by default).

## Roll back

v0.7.x ignores the new tables. To go back, run the v0.7.x image for the API and remove the worker. The API then cleans up uploads itself again.
