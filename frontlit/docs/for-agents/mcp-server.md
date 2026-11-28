---
title: "MCP Server"
description: "Control MediaLit using the Model Context Protocol (MCP)"
slug: mcp-server
nav_order: 10
---

## Introduction

Agents create files: reports, images, exports and screenshots. The MediaLit MCP server gives any MCP client a place to keep them and a link to share. Files an agent keeps appear in your [dashboard](/docs/dashboard) and are available to your apps through the API.

Once connected, you can ask things like:

- "Upload this chart as a public file and give me the link."
- "List the files I uploaded this week."
- "Delete the drafts you made earlier."
- "How much storage am I using?"

Uploads from agents are [temporary until sealed](#temporary-uploads-and-sealing), so an agent's scratch files are cleaned up unless it, or you, decides to keep them. The [CLI](/docs/cli) is different: it seals uploads right away unless the agent passes `--temp`.

The server is at `https://api.medialit.cloud/mcp` and uses the Streamable HTTP transport, so there is nothing to install or run locally.

---

## How to Connect

MediaLit supports two ways to authenticate your MCP client. **Using the OAuth 2.0 setup is recommended** as it is the easiest and most secure option.

### 1. OAuth 2.0 Setup (Recommended)

Connecting with OAuth is straightforward:

1. **Enter the Connection URL:** Provide the client with the MediaLit MCP server URL: `https://api.medialit.cloud/mcp`
2. **Redirect & Login:** The client will redirect you to the MediaLit login screen.
3. **Authorize:** Enter your email address to log in, and authorize the connection.

Once approved, you are logged in and the client will automatically handle connection keys in the background.

MediaLit supports Client ID Metadata Documents (CIMD) for current MCP clients and keeps Dynamic Client Registration (DCR) enabled for compatible clients. Registration identifies the client; users still sign in and approve access before it receives a token.

<Callout type="info" title="Choosing an app">
  If you have more than one app, MediaLit asks which one to connect after you sign in. The agent's uploads and changes all happen in that app. Connect again to choose a different one. The [CLI](/docs/cli) uses the same sign-in.
</Callout>

**Claude Code:**

```bash
claude mcp add --transport http medialit https://api.medialit.cloud/mcp
```

Then run `/mcp` in Claude Code to sign in.

### 2. API Key Setup (Alternative)

If you are using developer-focused tools like Cursor or Claude Code and prefer a quick configuration, you can use your MediaLit account API key instead.

Add the following config to your client:

- **Header:** `x-medialit-apikey`
- **Value:** `YOUR_API_KEY`

**Claude Desktop Configuration (`claude_desktop_config.json`):**

Since Claude Desktop communicates via standard input/output (stdio), you must use a proxy/bridge tool like `mcp-remote` to connect to the remote Streamable HTTP server:

```json
{
    "mcpServers": {
        "medialit": {
            "command": "npx",
            "args": [
                "mcp-remote",
                "https://api.medialit.cloud/mcp",
                "--header",
                "x-medialit-apikey: ${API_KEY}"
            ],
            "env": {
                "API_KEY": "YOUR_API_KEY"
            }
        }
    }
}
```

**VS Code configuration (`mcp.json`):**

```
{
    "servers": {
        "medialit": {
            "type": "http",
            "url": "https://api.medialit.cloud/mcp",
            "headers": {
                "x-medialit-apikey": "YOUR_API_KEY"
            }
        }
    }
}
```

---

## Temporary uploads and sealing

`upload_media` creates a temporary file that doesn't appear in `list_media`, `get_media_count` or `get_total_storage`. Call `seal_media` to keep it; temporary files are deleted after 24 hours. See [Temporary uploads and sealing](/docs/concepts#temporary-uploads-and-sealing).

---

## Tools Reference

The MediaLit MCP server exposes the following tools to connected agents.

`seal_media` and `delete_media` can't be undone, so they only run with `confirm: true`. Agents should check with you first, then pass it.

### Media Management

#### `list_media`

Returns a paginated list of finalized (sealed) media items.

- **Inputs:**
    - `page` _(number, optional)_: Page offset (default: `1`).
    - `limit` _(number, optional)_: Items per page (default: `10`).
    - `access` _("public" | "private", optional)_: Filter by accessibility level.
    - `group` _(string, optional)_: Filter by custom group label.
- **Output:** `{ mediaItems: Array, total: number, page: number }`

#### `get_media`

Fetches complete metadata for a single media item by its ID.

- **Inputs:**
    - `mediaId` _(string, required)_: The unique ID of the media item.
- **Output:** The media document.
- **Note:** Unlike `list_media`, this tool can fetch `temp: true` (unsealed) media items, allowing validation before sealing.

#### `get_media_count`

Returns the total count of finalized media items in the account.

- **Output:** `{ count: number }`

#### `get_total_storage`

Returns the total storage space consumed by the account, the allowed maximum in bytes, and the video processing minutes used this month.

- **Output:** `{ storage: number, maxStorage: number, processingMinutes: { used: number, allowed: number | null } }`. `allowed` is `null` when there is no limit.

#### `seal_media`

Finalizes a temporary media upload, allowing it to persist and show up in lists/tallies.

- **Inputs:**
    - `mediaId` _(string, required)_: The unique ID of the media item to seal.
    - `confirm` _(boolean, required to run)_: `true` once you have confirmed sealing.
    - `processing` _(object, optional)_: processing settings for this upload, instead of the app's. `videoStreaming` _(`off` | `hls` | `mp4`)_ decides what is made from a video. Fields left out use the app's settings; ignored when the media is already sealed.
- **Output:** The updated media document.

#### `delete_media`

Permanently deletes a media file and all generated derivatives (thumbnails, WebP conversions) from storage.

- **Inputs:**
    - `mediaId` _(string, required)_: The unique ID of the media item to delete.
    - `confirm` _(boolean, required to run)_: `true` once you have confirmed the deletion.
- **Output:** `{ deleted: true, mediaId: string }`

---

### File Uploading & Access

#### `upload_media`

Uploads a new file directly using base64-encoded payload parameters.

- **Inputs:**
    - `fileBase64` _(string, required)_: Base64-encoded string of the file bytes.
    - `fileName` _(string, required)_: Filename with extension (e.g. `image.png`).
    - `mimeType` _(string, required)_: The MIME type of the file (e.g. `image/png`).
    - `caption` _(string, optional)_: Text description or caption.
    - `access` _("public" | "private", optional)_: Access controls (default: `private`).
    - `group` _(string, optional)_: Custom folder/group tag.
- **Output:** `{ mediaId: string }`
- **Limits:** Requests to the MCP server are limited to 2 MB, and base64 makes a file about a third larger, so this tool works for files up to about 1.5 MB. For larger files, an agent that can run commands can use the [CLI](/docs/cli), which uploads in resumable chunks. Otherwise, use `create_upload_signature` and upload the file with [`@medialit/uploader`](/docs/other-frameworks) or the REST API.

#### `create_upload_signature`

Creates a short-lived [upload signature](/docs/concepts#upload-signatures) that lets a browser or script upload one file to MediaLit without an API key.

- **Inputs:**
    - `group` _(string, optional)_: Optional group to associate with the uploaded file.
- **Output:** `{ signature: string }`

---

### Media Settings

#### `get_media_settings`

Retrieves the app's media processing settings.

- **Output:** `useWebP`, `webpOutputQuality`, `videoStreaming` (`off`, `hls` or `mp4`; apps start `off`) and `hlsRenditions`.

#### `update_media_settings`

Changes the app's media processing settings. Supply only the properties you wish to modify. Changes apply to files sealed afterwards.

- **Inputs:**
    - `useWebP` _(boolean, optional)_: Auto-convert uploaded images to WebP.
    - `webpOutputQuality` _(number, optional)_: Output quality between `1` and `100`. It is `80` when not set.
    - `videoStreaming` _(`off` | `hls` | `mp4`, optional)_: How sealed videos are prepared for playback. Apps start `off`.
    - `hlsRenditions` _(array, optional)_: HLS sizes from `1080p`, `720p`, `480p` and `360p`. `null` restores the default.
    - `generateCaptions` _(boolean, optional)_: Make [captions](/docs/concepts#captions) and a transcript for sealed videos and audio files. Apps start `false`. `get_media_settings` also returns `captionsAvailable`, `false` when the server has no transcription worker.
- **Output:** `{ message: "success" }`

---

### Webhooks

[Webhooks](/docs/webhooks) tell your server when processing of a sealed file finishes or fails.

#### `list_webhooks`

Lists the app's webhook endpoints.

- **Output:** `{ endpoints: [{ id, url, events, enabled, secretHint, createdAt, updatedAt }] }`. Signing secrets aren't listed, only their last characters; the MCP server doesn't reveal existing secrets. Use the dashboard, the REST API or the CLI to read one, or rotate it.

#### `create_webhook`

Adds an endpoint. The URL must use `https` and must not point at a private or internal address.

- **Inputs:**
    - `url` _(string)_: The URL that receives events.
    - `events` _(string[], optional)_: `media.processing.ready` and/or `media.processing.failed`. Defaults to both.
    - `enabled` _(boolean, optional)_: Defaults to `true`.
- **Output:** The endpoint, with its signing `secret`.

#### `update_webhook`

Changes an endpoint. Omitted fields keep their values.

- **Inputs:**
    - `id` _(string)_: The endpoint's ID (`wh_…`).
    - `url`, `events`, `enabled` _(optional)_: New values.
    - `rotateSecret` _(boolean, optional)_: Replace the signing secret.
- **Output:** The updated endpoint, with the new `secret` when it was rotated.

#### `delete_webhook`

Removes an endpoint. Destructive: pass `confirm: true` once the user has agreed.

- **Inputs:** `id` _(string)_
- **Output:** `{ message: "success" }`

#### `test_webhook`

Sends a signed `webhook.test` event to an endpoint now.

- **Inputs:** `id` _(string)_
- **Output:** `{ result: "delivered", status }`, or `{ result: "failed" }` with the `status` the endpoint answered or a generic `error` (`timeout`, `connection_failed`, `tls_error`, `blocked_address`).
