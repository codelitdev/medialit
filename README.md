<div align="center">

<img src="assets/logo.svg" alt="MediaLit logo" width="72" height="72" />

# MediaLit

**Storage for agents, apps and humans.**

Upload, store, optimize and stream files on any S3-compatible storage, through a REST API,<br />
a drop-in React uploader and video player, an MCP server, a CLI and a dashboard.

[![npm](https://img.shields.io/npm/v/medialit?label=medialit)](https://www.npmjs.com/package/medialit)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE.md)
[![Discord](https://img.shields.io/badge/chat-Discord-5865F2)](https://discord.gg/AysdDP4wxe)
[![Integration tests](https://github.com/codelitdev/medialit/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/codelitdev/medialit/actions/workflows/integration-tests.yml)
[![Code quality](https://github.com/codelitdev/medialit/actions/workflows/code-quality.yaml/badge.svg)](https://github.com/codelitdev/medialit/actions/workflows/code-quality.yaml)

[Website](https://medialit.cloud) · [Docs](https://medialit.cloud/docs) · [Quick start](https://medialit.cloud/docs/quick-start) · [Self-hosting](https://medialit.cloud/docs/self-hosting)

</div>

---

## Why MediaLit

Object storage only stores bytes. To use it for uploads in a real app you also need presigned URLs, bucket policies, CORS, thumbnails, video encoding, a database of what you stored, and a way to clean up files nobody uses. MediaLit is that layer, and it gives apps, AI agents and people one place to work on the same files.

- **Uploads straight from the browser.** Your server hands out a short-lived signature, so your API key never reaches the browser. Large files upload in resumable chunks.
- **No orphaned files.** Uploads stay temporary until you seal them, and MediaLit deletes the ones nobody keeps.
- **Built for agents.** Claude, ChatGPT, Cursor and any MCP client can save and share files over OAuth. Coding agents can run the CLI.
- **Images and videos ready for the web.** Images and videos get thumbnails when they're uploaded, and a sealed video gets a poster picked from the video, skipping dark frames. Each app can convert images to WebP, and turn videos into an MP4 optimized for the web or HLS streams that adapt to the viewer's connection.
- **Know when a file is ready.** Media reports its processing status and metadata such as duration, dimensions and codecs, and signed webhooks tell your server when processing finishes or fails.
- **Public and private files,** with signed links for private videos and streams, and quotas.
- **Open source and portable.** Everything that runs [medialit.cloud](https://medialit.cloud) is in this repository. Self-host it on AWS S3, Cloudflare R2, MinIO or any S3-compatible storage, with the same API.

MediaLit is the file backend for [CourseLit](https://courselit.app) and more.

## Quick start

Upload a file from your terminal:

```bash
npm install -g @medialit/cli
medialit login
medialit upload photo.jpg --public
```

Add an uploader to a React app:

```tsx
import { MediaLitUploader } from "@medialit/react";
import "@medialit/react/styles.css";

<MediaLitUploader
    signatureEndpoint="/api/medialit/signature"
    onUploadComplete={(media) => console.log(media.file)}
/>;
```

```ts
// app/api/medialit/signature/route.ts
import { createSignatureHandler } from "medialit";

export const POST = createSignatureHandler({
    authorize: async () => !!(await getSession()), // your app's auth
});
```

Play a video with the best version MediaLit made of it, HLS, web MP4 or the original:

```tsx
import { MediaLitVideo } from "@medialit/react";

// `media` comes from your server: medialit.get(mediaId) with the Node.js SDK.
<MediaLitVideo media={media} width={640} />;
```

Connect an AI agent: add `https://api.medialit.cloud/mcp` as a remote MCP server in your client and sign in.

See the [docs](https://medialit.cloud/docs) for the full guides, the [REST API](https://medialit.cloud/docs/api/upload-media) and [self-hosting](https://medialit.cloud/docs/self-hosting).

## Packages

| Package                                                     | Description                                                 | Version                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`medialit`](packages/medialit)                             | Node.js SDK                                                 | [![npm](https://img.shields.io/npm/v/medialit)](https://www.npmjs.com/package/medialit)                                       |
| [`@medialit/react`](packages/react)                         | `MediaLitUploader`, `useMediaLitUpload` and `MediaLitVideo` | [![npm](https://img.shields.io/npm/v/@medialit/react)](https://www.npmjs.com/package/@medialit/react)                         |
| [`@medialit/uploader`](packages/uploader)                   | Resumable uploads from the browser or Node.js               | [![npm](https://img.shields.io/npm/v/@medialit/uploader)](https://www.npmjs.com/package/@medialit/uploader)                   |
| [`@medialit/cli`](packages/cli)                             | The `medialit` command                                      | [![npm](https://img.shields.io/npm/v/@medialit/cli)](https://www.npmjs.com/package/@medialit/cli)                             |
| [`@medialit/integration-tests`](packages/integration-tests) | Integration tests and a production synthetic check          | [![npm](https://img.shields.io/npm/v/@medialit/integration-tests)](https://www.npmjs.com/package/@medialit/integration-tests) |

The repository also contains the API and its worker (`apps/api`), which own all product behavior, and the dashboard (`apps/web`), a thin client over the API. The worker runs the background work: publishing sealed files, video posters and encoding, webhook deliveries and cleanup. The docs live in `frontlit/docs` and publish to [medialit.cloud/docs](https://medialit.cloud/docs) through FrontLit.

## Self-hosting

MediaLit needs PostgreSQL, two S3-compatible buckets (one private and one public), and the [worker](https://medialit.cloud/docs/self-hosting#run-the-worker) next to the API. The [self-hosting guide](https://medialit.cloud/docs/self-hosting) covers AWS S3 with CloudFront, Cloudflare R2 and MinIO, along with upload limits and monitoring.

To stream video, give the worker [room to encode](https://medialit.cloud/docs/self-hosting#size-the-worker-for-video) (about 2 CPUs, 2 GB of memory and 12 GB of disk for videos up to 1 GB), and let browsers [read video segments](https://medialit.cloud/docs/self-hosting#allow-players-to-read-video-segments) from your storage with a CORS rule.

MediaLit streams uploads into the private bucket as S3 multipart uploads, so the bucket needs a lifecycle rule that aborts incomplete multipart uploads. The guide shows how to [set it up](https://medialit.cloud/docs/self-hosting#clean-up-unfinished-uploads).

Upgrading? Follow the guide for each version you pass:

- [v0.8.x to v0.9.0](https://medialit.cloud/docs/upgrade-from-v0-8-x-to-v0-9-0): video posters, MP4 for the web and HLS streaming, which need a bigger worker
- [v0.7.x to v0.8.0](https://medialit.cloud/docs/upgrade-from-v0-7-x-to-v0-8-0): a worker service runs background jobs
- [v0.6.x to v0.7.0](https://medialit.cloud/docs/upgrade-from-v0-6-x-to-v0-7-0): uploads stream to your bucket, which needs the lifecycle rule
- [v0.5.x to v0.6.0](https://medialit.cloud/docs/upgrade-from-v0-5-x-to-v0-6-0): API keys are stored as hashes
- [v0.4.0 to v0.5.0](https://medialit.cloud/docs/upgrade-from-v0-4-0-to-v0-5-0): PostgreSQL replaces MongoDB

## Development

**Requirements:** [Bun](https://bun.sh) 1.4.4, Docker, `ffmpeg` for thumbnails, posters and video encoding, and `webp` for image conversion. We develop on Linux; on Windows, use WSL.

```bash
sudo apt install ffmpeg webp
bun install

# Postgres, MinIO and Mailpit. The API and dashboard run on your machine.
docker compose -f docker-compose.local.yml up -d

# Configure the API (set EMAIL to your address) and create its tables.
cp apps/api/.env.example apps/api/.env
bun --filter @medialit/api db:migrate

bun --filter @medialit/api dev          # API on http://localhost:8000
bun --filter @medialit/api dev:worker   # Worker: background jobs
bun --filter @medialit/web dev          # Dashboard on http://localhost:3000
bun run dev:docs                        # Docs on http://localhost:3008
```

Without the worker, sealed files don't get their posters, MP4 or HLS, public files aren't published, and webhooks aren't sent. On its first start, the API creates a user for `EMAIL` and a default app. Sign in to the dashboard with `EMAIL`; the code arrives in Mailpit at <http://127.0.0.1:8025>. Create an API key in the app's settings, or set `MEDIALIT_BOOTSTRAP_API_KEY` in `apps/api/.env` to have the API create one at startup. The MinIO console is at <http://127.0.0.1:9001> (`medialit` / `medialit-secret`).

If you run the dashboard on another port, set `WEB_ORIGIN` in `apps/api/.env` to match, or sign-in redirects fail.

### Tests

```bash
bun run test                    # Unit tests
bun run test:integration:stack  # REST, WebP, video, MCP and CLI suites against a fresh stack
```

`test:integration:stack` is the check every pull request must pass. It starts its own Postgres, MinIO, Mailpit, API and worker on separate ports, so it doesn't touch your dev stack. To run the suites against an API that's already running:

```bash
MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 bun run test:integration
```

## Contributing

Contributions are welcome. For anything larger than a small fix, please open an issue first so we can agree on the approach.

1. Fork the repository and create a branch.
2. Make your change, with tests. If you change a published package, add a changeset with `bunx changeset`.
3. Run `bun run lint`, `bun run prettier` and `bun run test`, and `bun run test:integration:stack` for API, MCP or CLI changes.
4. Open a pull request. The integration tests run on every pull request and must pass.

Questions are welcome on [Discord](https://discord.gg/AysdDP4wxe) or in [GitHub issues](https://github.com/codelitdev/medialit/issues).

## Security

Please don't report security issues in public issues. Report them privately through [GitHub's security advisories](https://github.com/codelitdev/medialit/security/advisories/new).

## Licensing

MediaLit is split into two licenses:

- **AGPL-3.0-or-later** covers the server (`apps/api`), the dashboard (`apps/web`) and internal tooling. If you run a modified MediaLit as a hosted service, you must share your changes under the same license. Self-hosting is free.
- **MIT** covers the client packages you embed in your own products: `medialit`, `@medialit/react`, `@medialit/uploader`, and `@medialit/cli`. Each published MIT package ships its own `LICENSE` file.

The AGPL license text is in [LICENSE.md](./LICENSE.md).
