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
pnpm --filter @medialit/api dev
```

When the API starts for the very first time, a user with the provided email will be generated, and their subscription will be renewed for 10 years.

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
pnpm --filter @medialit/web dev
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
pnpm install
```

### Build packages

```bash
pnpm -r build
```

### Run the service

```bash
pnpm --filter=@medialit/api dev
```

### Publishing a new version

```bash
pnpm exec changeset
```
