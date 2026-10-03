# Introduction

MediaLit is a platform for uploading, transforming, and storing files on any S3-compatible storage provider.

Use it as cloud storage for your apps, a personal media drive, or a file system for AI agents. MediaLit provides both a REST API and an MCP server for managing files programmatically.

## Managing your files

This repository contains:

- The backend API (under `apps/api`)
- The frontend (under `apps/web`)

### Starting the API

In order to upload files to the platform, you need to have an app. You can interact with the service using the app's API key.

To create one, set up the following variable in your `.env` file:

```sh
EMAIL=email@yourdomain.com
```

Then, start the API:

```bash
bun --filter @medialit/api dev
```

When the API starts for the very first time, a user with the provided email will be generated with an active subscription. The user signs in to the dashboard with an email one-time code.

Additionally, a default app will be generated for the user and its API key will be printed in the application logs. The log containing the API key will look something like the following:

```sh
{"level":30,"time":1781683124417,"pid":20848,"hostname":"hostname","apiKey":"kwtwsoMX3Xs_sDNxklMfz","msg":"Admin user created"}
```

> CAUTION: Keep the generated API key confidential, as anyone could use it to store files on your instance.

### Starting the frontend

The frontend is optional if you simply want to store, transform, and manage your files.

Use the frontend if you want to:

- Manage files through a user interface
- Organize your files across multiple apps instead of putting everything in the default app

To start the frontend:

```sh
bun --filter @medialit/web dev
```

Then log in using the same email you provided above while booting up the API.

## API documentation

To interact with the service, you can use the REST API. Our API is documented [here](https://docs.medialit.cloud/api/createUploadSignature).

## Development

We build on Linux-based systems. Hence, these instructions are for those systems only. If you are on Windows, we recommend using WSL.

### Install the utilities

```bash
sudo apt install ffmpeg webp
```

### Install dependencies

```bash
bun install
```

Start Postgres, MinIO, and Mailpit, then copy the local environment file:

```bash
docker compose -f docker-compose.local.yml up
cp apps/api/.env.example apps/api/.env
```

`docker-compose.local.yml` is only the local dependencies. The API and web app run on the host. Do not run it at the same time as `docker-compose.yml`; both publish Postgres on port 5433. MinIO is at <http://127.0.0.1:9000> (console at <http://127.0.0.1:9001>) and Mailpit's inbox is at <http://127.0.0.1:8025>.

`OAUTH_SIGNING_KEY` must be at least 32 bytes. Start the API once so it applies database migrations. Existing production data can then be copied from Mongo with `MONGO_URL` (or `DB_CONNECTION_STRING`) and `DATABASE_URL` set, then `bun --filter @medialit/scripts import:mongo`. The import checks that its tables already exist and does not migrate. It keeps user ids, public user ids, API key secrets, and media ids. Tus uploads are local and are not imported.

### Run the service

```bash
bun --filter=@medialit/api dev
```

### Publishing a new version

```bash
bunx changeset
```
