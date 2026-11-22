---
title: "Webhooks"
description: "Get told when processing of a sealed file finishes or fails, with signed requests."
slug: webhooks
nav_order: 60
---

MediaLit can send your server a request when it finishes processing a sealed file, or when processing fails. Requests are signed following [Standard Webhooks](https://www.standardwebhooks.com/), so you can check that they come from MediaLit.

Events fire only when background processing changes a file's [processing status](/docs/concepts#processing-status-and-derivatives). A seal that finishes all its work inline sends no event, because the seal response already has the result.

## Add an endpoint

Each app can have up to 10 endpoints. An endpoint has a URL, a signing secret, the events it receives and an enabled flag. You can manage endpoints from the dashboard (**App settings** › **Webhooks**), the REST API, the [CLI](/docs/cli#manage-webhooks), the [MCP server](/docs/mcp-server) or the [Node.js SDK](/docs/node-sdk).

```bash
curl -X POST https://api.medialit.cloud/settings/webhooks/create \
  -H "x-medialit-apikey: $MEDIALIT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"url": "https://example.com/hooks/medialit"}'
```

The response includes the endpoint's `id` and its `secret` (`whsec_…`). Listing endpoints doesn't return secrets, only their last characters (`secretHint`), because listing needs only read access and the secret lets its holder sign webhooks. Read a secret again with `POST /settings/webhooks/secret`, which needs write access (an API key, or an OAuth token with `data:write`), or with **Show** in the dashboard.

| Route                            | What it does                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /settings/webhooks/create` | Adds an endpoint: `url`, and optionally `events` and `enabled`. Returns its secret.                                     |
| `POST /settings/webhooks/get`    | Lists the app's endpoints, without their secrets.                                                                       |
| `POST /settings/webhooks/secret` | Returns an endpoint's signing secret (`id`). Needs write access.                                                        |
| `POST /settings/webhooks/update` | Changes an endpoint (`id`, then `url`, `events`, `enabled` or `rotateSecret: true`). A rotation returns the new secret. |
| `POST /settings/webhooks/delete` | Removes an endpoint (`id`). Deliveries still waiting for it are not sent.                                               |
| `POST /settings/webhooks/test`   | Sends a signed `webhook.test` event to the endpoint now (`id`).                                                         |

The URL must use `https`, and it must not point at a private or internal address, such as `localhost`, `10.0.0.0/8` or a cloud metadata address. MediaLit checks the URL when you save it and again before every delivery. On a self-hosted server you can allow internal addresses with [`WEBHOOK_ALLOW_PRIVATE_NETWORKS`](/docs/self-hosting#webhooks).

The test action answers `{ "result": "delivered", "status": 200 }`, or `"failed"` with the `status` your endpoint answered or an `error`: `timeout`, `connection_failed`, `tls_error` or `blocked_address`.

## Events

| Event                     | When                                                     |
| ------------------------- | -------------------------------------------------------- |
| `media.processing.ready`  | Processing of a sealed file finished.                    |
| `media.processing.failed` | Some processing of a sealed file failed. The file works. |

Endpoints receive both unless you pass `events`. A failed step never makes the original file unavailable.

## Payload

```json
{
    "type": "media.processing.ready",
    "timestamp": "2026-11-22T10:15:30.120Z",
    "data": {
        "mediaId": "Hk3pX0lQ7cY9tWm2",
        "appId": "a8Jd03kLs9QpZx1n",
        "status": "ready",
        "derivatives": {
            "thumbnail": { "status": "ready" },
            "poster": { "status": "ready" }
        }
    }
}
```

For `media.processing.failed`, `status` is `failed`, and each failed derivative has an `error`.

The payload carries IDs and statuses only, never URLs: signed URLs for private files expire. Call `POST /media/get/:mediaId` (or `get` in the SDK) to get the file's URLs.

## Verify the signature

Every request has three headers:

- `webhook-id`: the message ID. Retries of the same event keep it, so use it to drop duplicates.
- `webhook-timestamp`: when this attempt was sent, in seconds since the epoch.
- `webhook-signature`: `v1,` and a base64 HMAC-SHA256 of `{webhook-id}.{webhook-timestamp}.{body}`, keyed with the base64-decoded part of the secret after `whsec_`.

Verify against the raw request body, before parsing it. A [Standard Webhooks library](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries) does it for you, and rejects old timestamps:

```js
import express from "express";
import { Webhook } from "standardwebhooks";

const webhook = new Webhook(process.env.MEDIALIT_WEBHOOK_SECRET);
const app = express();

app.post(
    "/hooks/medialit",
    express.raw({ type: "application/json" }),
    (req, res) => {
        let event;
        try {
            event = webhook.verify(req.body.toString(), req.headers);
        } catch {
            return res.status(400).end();
        }
        if (event.type === "media.processing.ready") {
            // event.data.mediaId is ready: fetch its URLs from MediaLit.
        }
        res.status(204).end();
    },
);
```

Without a library, compute the HMAC yourself and compare it in constant time:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, headers, body) {
    const id = headers["webhook-id"];
    const timestamp = headers["webhook-timestamp"];
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key)
        .update(`${id}.${timestamp}.${body}`)
        .digest();
    return headers["webhook-signature"].split(" ").some((entry) => {
        const [version, signature] = entry.split(",");
        const given = Buffer.from(signature ?? "", "base64");
        return (
            version === "v1" &&
            given.length === expected.length &&
            timingSafeEqual(given, expected)
        );
    });
}
```

To rotate a secret, call `update` with `rotateSecret: true` (or **Rotate secret** in the dashboard, or `medialit webhooks rotate <id>`). The old secret stops working at once, so update your receiver right after.

## Retries

Answer with any `2xx` status within 10 seconds. Anything else counts as a failed attempt, including redirects: MediaLit doesn't follow them. It reads at most 64 KB of your response and ignores it.

A failed delivery is retried with the same `webhook-id` and body, 8 attempts in all over about 24 hours: after 30 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 8 hours and 8 hours, each with a little jitter. An endpoint whose URL resolves to a refused address is not retried.

The dashboard's **Recent deliveries** list shows each delivery's status, attempts and the last result: the status code your endpoint answered, or a generic error such as `timeout`. MediaLit never stores your response body.

Deliveries aren't sent if, by the time they go out, the endpoint was deleted or disabled, or its app was deleted. Your receiver should still be idempotent: drop a `webhook-id` it has already handled.
