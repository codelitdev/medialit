<div align="center">

<img src="assets/logo.svg" alt="MediaLit logo" width="72" height="72" />

# MediaLit

**Storage for agents, apps and humans.**

Upload, store and serve files on any S3-compatible storage, through a REST API,<br />
a drop-in React uploader, an MCP server, a CLI and a dashboard.

[![npm](https://img.shields.io/npm/v/medialit?label=medialit)](https://www.npmjs.com/package/medialit)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE.md)
[![Discord](https://img.shields.io/badge/chat-Discord-5865F2)](https://discord.gg/AysdDP4wxe)
[![Integration tests](https://github.com/codelitdev/medialit/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/codelitdev/medialit/actions/workflows/integration-tests.yml)
[![Code quality](https://github.com/codelitdev/medialit/actions/workflows/code-quality.yaml/badge.svg)](https://github.com/codelitdev/medialit/actions/workflows/code-quality.yaml)

[Website](https://medialit.cloud) · [Docs](https://docs.medialit.cloud) · [Quick start](https://docs.medialit.cloud/quick-start) · [Self-hosting](https://docs.medialit.cloud/self-hosting)

</div>

---

## Why MediaLit

Object storage only stores bytes. To use it for uploads in a real app you also need presigned URLs, bucket policies, CORS, thumbnails, a database of what you stored, and a way to clean up files nobody uses. MediaLit is that layer, and it gives apps, AI agents and people one place to work on the same files.

- **Uploads straight from the browser.** Your server hands out a short-lived signature, so your API key never reaches the browser. Large files upload in resumable chunks.
- **No orphaned files.** Uploads stay temporary until you seal them, and MediaLit deletes the ones nobody keeps.
- **Built for agents.** Claude, ChatGPT, Cursor and any MCP client can save and share files over OAuth. Coding agents can run the CLI.
- **Public and private files,** thumbnails for images and videos, optional WebP conversion, and quotas.
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

Connect an AI agent: add `https://api.medialit.cloud/mcp` as a remote MCP server in your client and sign in.

See the [docs](https://docs.medialit.cloud) for the full guides, the [REST API](https://docs.medialit.cloud/api/uploadMedia) and [self-hosting](https://docs.medialit.cloud/self-hosting).

## Packages

| Package                                                     | Description                                               | Version                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`medialit`](packages/medialit)                             | Node.js SDK                                               | [![npm](https://img.shields.io/npm/v/medialit)](https://www.npmjs.com/package/medialit)                                       |
| [`@medialit/react`](packages/react)                         | `MediaLitUploader` component and `useMediaLitUpload` hook | [![npm](https://img.shields.io/npm/v/@medialit/react)](https://www.npmjs.com/package/@medialit/react)                         |
| [`@medialit/uploader`](packages/uploader)                   | Resumable uploads from the browser or Node.js             | [![npm](https://img.shields.io/npm/v/@medialit/uploader)](https://www.npmjs.com/package/@medialit/uploader)                   |
| [`@medialit/cli`](packages/cli)                             | The `medialit` command                                    | [![npm](https://img.shields.io/npm/v/@medialit/cli)](https://www.npmjs.com/package/@medialit/cli)                             |
| [`@medialit/integration-tests`](packages/integration-tests) | Integration tests and a production synthetic check        | [![npm](https://img.shields.io/npm/v/@medialit/integration-tests)](https://www.npmjs.com/package/@medialit/integration-tests) |

The repository also contains the API (`apps/api`), which owns all product behavior; the dashboard (`apps/web`), a thin client over the API; and the docs site (`apps/docs`).

## Self-hosting

MediaLit needs PostgreSQL and two S3-compatible buckets, one private and one public. The [self-hosting guide](https://docs.medialit.cloud/self-hosting) covers AWS S3 with CloudFront, Cloudflare R2 and MinIO, along with upload limits and monitoring.

Upgrading from v0.4.0? v0.5.0 replaces MongoDB with PostgreSQL. Follow the [upgrade guide](https://docs.medialit.cloud/upgrade-from-v0-4-0-to-v0-5-0).

## Development

**Requirements:** [Bun](https://bun.sh) 1.4.1, Docker, and `ffmpeg` and `webp` for thumbnails and image conversion. We develop on Linux; on Windows, use WSL.

```bash
sudo apt install ffmpeg webp
bun install

# Postgres, MinIO and Mailpit. The API and dashboard run on your machine.
docker compose -f docker-compose.local.yml up -d

# Configure the API (set EMAIL to your address) and create its tables.
cp apps/api/.env.example apps/api/.env
bun --filter @medialit/api db:migrate

bun --filter @medialit/api dev   # API on http://localhost:8000
bun --filter @medialit/web dev   # Dashboard on http://localhost:3000
bun run dev:docs                 # Docs on http://localhost:3008
```

On its first start, the API creates a user for `EMAIL` and a default app, and logs the app's API key (`"msg":"Admin user created"`). Keep it private: anyone with it can upload to your instance. Sign in to the dashboard with `EMAIL`; the code arrives in Mailpit at <http://127.0.0.1:8025>. The MinIO console is at <http://127.0.0.1:9001> (`medialit` / `medialit-secret`).

If you run the dashboard on another port, set `WEB_ORIGIN` in `apps/api/.env` to match, or sign-in redirects fail.

### Tests

```bash
bun run test                    # Unit tests
bun run test:integration:stack  # REST, MCP and CLI suites against a fresh stack
```

`test:integration:stack` is the check every pull request must pass. It starts its own Postgres, MinIO, Mailpit and API on separate ports, so it doesn't touch your dev stack. To run the suites against an API that's already running:

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

## License

MediaLit is licensed under the [GNU Affero General Public License v3.0](./LICENSE.md).
