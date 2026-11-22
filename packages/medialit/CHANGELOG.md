# medialit

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
