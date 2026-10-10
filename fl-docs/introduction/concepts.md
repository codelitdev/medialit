---
title: How MediaLit works
slug: concepts
nav_order: 40
---

## Apps and API keys

An app is a separate space for files, like a bucket. Each app has its own files, image settings and API key. Create one app per project or environment, for example `blog-production` and `blog-staging`.

A request made with an app's API key only sees that app's files. When an agent connects to the [MCP server](/docs/mcp-server) or you log in with the [CLI](/docs/cli), you choose an app in the browser, and everything it does happens in that app. If you have only one app, it is chosen for you.

## Temporary uploads and sealing

Every upload to the API starts out **temporary**. A temporary file:

- has a working URL, so you can show a preview right away
- does not appear in listings, counts, storage totals or the dashboard
- is deleted automatically after 24 hours

**Sealing** keeps a file. Call seal when the file is actually used, for example when the user saves the form the file was uploaded from, or when an agent decides its output is worth keeping.

This handles a problem plain object storage leaves to you. When a user uploads an avatar and then closes the tab without saving, the file would otherwise stay in your bucket forever. With MediaLit, you only seal files your app actually uses, and anything else is deleted for you.

### Who seals

| You upload with | The upload is | To keep it |
| --- | --- | --- |
| [REST API](https://medialit.cloud/docs/api/uploadMedia), [Node.js SDK](/docs/node-sdk), [React](/docs/react), [`@medialit/uploader`](/docs/other-frameworks) | Temporary | Seal it from your server |
| [MCP server](/docs/mcp-server) | Temporary | The agent calls `seal_media` |
| [CLI](/docs/cli) | Sealed right away | Nothing to do. Pass `--temp` to leave it temporary |

The CLI seals for you because running `medialit upload` is already the decision to keep the file; there is no later step, like saving a form, to seal at. An agent using the CLI for scratch files should pass `--temp`, so they are cleaned up like MCP uploads.

> **Note:** Sealing a public file moves it to permanent public storage, so its `file` URL changes. Store the URL returned by the seal call, or store the `mediaId` and look up the URL when you need it.

## Public and private files

Choose `access` when you upload. It defaults to `private`.

- **Public** files get a permanent URL that anyone can open, served through a CDN when one is configured. Use them for images on public pages, avatars and downloads you want to share.
- **Private** files get a signed URL that expires. Look the file up again with `get` when you need a fresh URL. Use them for documents, paid content and anything per-user.

Until a file is sealed, its URL is a signed URL even if it is public.

## Groups

A group is a label for organising files inside an app, such as `avatars` or a customer ID. You can filter listings by group.

When your server creates an upload signature with a group, every file uploaded with that signature goes into the group.

## Upload signatures

Browsers must never see your API key. Instead, your server asks MediaLit for an upload signature and passes it to the browser, and the browser uploads directly to MediaLit with it. The file does not pass through your server.

1. The browser asks your server for a signature.
2. Your server checks that the user may upload, then creates a signature with its API key.
3. The browser uploads the file to MediaLit with the signature and gets the media back.
4. The browser saves the form with the `mediaId`, and your server seals it.

A signature expires after 24 hours, or once a file has been uploaded with it. Only give signatures to users you trust to upload, because uploads count against your storage.

[`createSignatureHandler`](/docs/node-sdk#createsignaturehandler) creates the server route for you, and [`@medialit/react`](/docs/react) handles the browser side.

## Resumable uploads

Browser uploads with [`@medialit/react`](/docs/react) or [`@medialit/uploader`](/docs/other-frameworks) use the [tus](https://tus.io) protocol. If the connection drops, the upload retries, and uploading the same file again continues from where it stopped.

The REST endpoint `POST /media/create` uploads a file in a single request instead. It is simpler for server-to-server uploads.

## Image processing

MediaLit processes files as they are uploaded:

- **Thumbnails** are generated for images and videos and returned as `thumbnail`.
- **WebP conversion**, when turned on in the app's settings, converts uploaded images to WebP. The original image is not kept.

Change these settings with the [Node.js SDK](/docs/node-sdk#getsettings-and-updatesettings), the [REST API](https://medialit.cloud/docs/api/uploadMedia) or the [MCP server](/docs/mcp-server).

## Limits

Your plan sets the largest file you can upload and your total storage. Uploads that would go over either limit are refused with a message you can show to the user. When you [self-host](/docs/self-hosting), you set the limits yourself.
