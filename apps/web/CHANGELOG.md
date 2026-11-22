# @medialit/web

## 0.3.1

### Patch Changes

- ef88146: The sign-in and app-picker pages show the MediaLit logo and favicon again. A stale `public/icon.svg` from 2024 was shadowing the current logo at `/icon.svg`. The app picker also fits phone screens.
- 561593b: Update the Codelit platform packages to 0.14.1 and Better Auth to 1.7.22, which carries Better Auth security fixes. On the sign-in page, "Continue with email" now waits for the security check, and the page fits phone screens. Sessions use hardened cookie settings without renaming the cookie when `AUTH_COOKIE_DOMAIN` is set, so nobody is signed out. A new `TRUST_PROXY` setting lists the proxies to trust for the client address; `ENABLE_TRUST_PROXY` keeps working.
- ad8729d: Update the Codelit platform packages to 0.15.0: dialog header spacing in the dashboard and PostHog ingestion fixes for logs and errors.
- e483c35: Webhooks moved into App settings, next to API keys, and the sidebar no longer has a separate Webhooks item. Links to the old page open App settings at the Webhooks section.

## 0.3.0

### Minor Changes

- 24deeff: Webhooks for media processing. Apps can have up to 10 endpoints, managed with `POST /settings/webhooks/create`, `/get`, `/update` (URL, events, enabled, or rotate the secret), `/secret` (reveal the signing secret, which needs write access), `/delete` and `/test`, the matching MCP tools (`list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`), `medialit webhooks …` in the CLI, the SDK's `listWebhooks`, `createWebhook`, `updateWebhook`, `revealWebhookSecret`, `deleteWebhook` and `testWebhook`, and a dashboard page that also lists recent deliveries. Listing endpoints returns only a `secretHint`; the full secret comes back from create, rotate and the reveal action.

    When a job finishing moves sealed media to `ready` or `failed`, the worker sends `media.processing.ready` or `media.processing.failed`, signed per Standard Webhooks, and retries for about 24 hours with the same `webhook-id`. Webhook URLs are checked when saved and before every delivery: production accepts `https` only, and private, internal and cloud-metadata addresses are refused (set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` on self-hosted installs whose receivers are on their own network). Deleting an app now also deletes its webhook endpoints and cancels its queued and running jobs. No existing field changes.

    The REST rate limit (120 requests a minute per client by default) can now be set with `API_RATE_LIMIT_PER_MINUTE`. The integration tests wait out a rate limit instead of failing.

### Patch Changes

- Updated dependencies [fe2b21f]
- Updated dependencies [24deeff]
    - @medialit/models@0.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [aeefee3]
    - @medialit/uploader@0.3.0

## 0.2.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.1.3

### Patch Changes

- Updated dependencies [c3e3bd3]
    - @medialit/uploader@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [2e18d2b]
    - medialit@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [c7d0050]
    - medialit@0.1.0
