---
title: "How MediaLit works"
description: "Apps, temporary uploads, access, groups and upload signatures."
slug: concepts
nav_order: 40
---

## Apps and API keys

An app is a separate space for files, like a bucket. Each app has its own files, image settings and [API keys](/docs/api-keys). Create one app per project or environment, for example `blog-production` and `blog-staging`.

A request made with one of an app's API keys only sees that app's files. When an agent connects to the [MCP server](/docs/mcp-server) or you log in with the [CLI](/docs/cli), you choose an app in the browser, and everything it does happens in that app. If you have only one app, it is chosen for you.

## Temporary uploads and sealing

Every upload to the API starts out **temporary**. A temporary file:

- has a working URL, so you can show a preview right away
- does not appear in listings, counts, storage totals or the dashboard
- is deleted automatically after 24 hours

**Sealing** keeps a file. Call seal when the file is actually used, for example when the user saves the form the file was uploaded from, or when an agent decides its output is worth keeping.

This handles a problem plain object storage leaves to you. When a user uploads an avatar and then closes the tab without saving, the file would otherwise stay in your bucket forever. With MediaLit, you only seal files your app actually uses, and anything else is deleted for you.

### Who seals

| You upload with                                                                                                                         | The upload is     | To keep it                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| [REST API](/docs/api/upload-media), [Node.js SDK](/docs/node-sdk), [React](/docs/react), [`@medialit/uploader`](/docs/other-frameworks) | Temporary         | Seal it from your server                           |
| [MCP server](/docs/mcp-server)                                                                                                          | Temporary         | The agent calls `seal_media`                       |
| [CLI](/docs/cli)                                                                                                                        | Sealed right away | Nothing to do. Pass `--temp` to leave it temporary |

The CLI seals for you because running `medialit upload` is already the decision to keep the file; there is no later step, like saving a form, to seal at. An agent using the CLI for scratch files should pass `--temp`, so they are cleaned up like MCP uploads.

<Callout>
  Sealing a public file moves it to permanent public storage, so its `file` URL changes. Store the URL returned by the seal call, or store the `mediaId` and look up the URL when you need it.
</Callout>

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

MediaLit processes files with the app's settings:

- **Thumbnails** are made for images and videos when they are uploaded, and returned as `thumbnail`. Image thumbnails are cropped to 16:9 from the center and are at most 480 pixels tall. Video thumbnails are 720 pixels tall.
- **Video posters** replace a video's thumbnail after it is sealed. The upload thumbnail is the first frame, which is often black; the poster is picked from about 10% into the video (at most 10 seconds in), skipping dark frames. It is published at the same URL, so a saved `thumbnail` URL shows the poster once it is ready. A CDN may keep serving the first frame until its cache expires. If the poster fails, the upload thumbnail stays.
- **WebP conversion**, when turned on, converts JPEG and PNG images to WebP when they are [sealed](#temporary-uploads-and-sealing), at the app's `webpOutputQuality` (1 to 100, 80 by default). The upload response describes the original file; the seal response describes the WebP, with its own `file`, `mimeType` and `size`, and the original is not kept. Save the URL from the seal response. Temporary uploads that are never sealed are never converted.

If a conversion fails, the seal still succeeds and keeps the original. `processing.status` is then `failed` and `processing.error` says why. Very large images (over 25 MB or 50 megapixels by default) and images sealed while the server is busy converting others also keep the original; their status is `ready` and `processing.error` gives the reason.

Change these settings in the dashboard under **App settings** > **Media**, or with the [Node.js SDK](/docs/node-sdk#getsettings-and-updatesettings), the [CLI](/docs/cli#change-media-settings), the [REST API](/docs/api/upload-media) or the [MCP server](/docs/mcp-server).

### Video streaming

The `videoStreaming` setting decides what is made from sealed videos:

- **`hls`** makes HLS streams with adaptive bitrate, the `hls` derivative: renditions from the app's `hlsRenditions` (`1080p`, `720p`, `480p` and `360p`; `1080p`, `720p` and `480p` by default), skipping any larger than the video, in 6-second segments. Players switch between them as the connection changes. `derivatives.hls.url` is the master playlist. For public videos it is a storage URL; for private videos it is a link to the MediaLit API that lasts for the video's length plus an hour and signs each segment for as long, so playback works however long the video is. Play it with [`MediaLitVideo`](/docs/react#medialitvideo) or any HLS player; see [Playing videos](#playing-videos).
- **`mp4`** makes an MP4 optimized for the web, the `mp4` derivative: H.264 video and AAC audio with the index at the front, so playback starts before the whole file loads. A video that is already H.264/AAC in MP4 or MOV, at most 1080p and 8 Mbps, is only rewritten (seconds, no quality lost, no processing minutes). Anything else is re-encoded, at most 1080p and never larger than the original.
- **`off`** makes only the poster.

Every app starts with `off`, and each app has its own setting: choose `hls` or `mp4` for the apps whose videos you want processed.

The original is always kept. Videos up to 1 GB and 2 hours are processed; larger or longer ones keep their original and poster, and their `mp4` or `hls` derivative fails with `source_too_large` or `source_too_long` while the file stays `ready`.

### Processing minutes

Video processing is measured in minutes of video, rounded up per video. Re-encoding counts; rewriting an MP4 that is already web-ready and making posters don't. Each account has a monthly allowance (calendar month, UTC): 5 minutes on the free plan and 300 on the paid plan. Self-hosted servers in OSS mode (`MEDIALIT_DEPLOYMENT_MODE=oss`, the Docker Compose default) have no limit. The stats from `getStats`, `GET /media/get/size`, the dashboard and `medialit whoami` show the minutes used this month.

### Processing status and derivatives

Every media response has three more fields:

- **`processing`** says where background processing of the file stands: `{ "status": "pending" }` until the file is sealed, then `processing` while work runs, and `ready` or `failed` when it ends. A failed step never makes the original unavailable, and `processing.error` says what went wrong.
- **`metadata`** describes the file: `kind` (`video`, `audio` or `image`), and where they apply `durationSeconds`, `width` and `height` (as displayed, after rotation), `rotation`, `frameRate`, `videoCodec`, `audioCodec`, `bitrate`, `sampleRate`, `channels` and `format`. It is read when the file is sealed, so it is `null` for temporary uploads, and stays `null` if the file can't be read; the seal still succeeds. If a video takes too long to read at seal, its poster job reads it and fills it in shortly after.
- **`derivatives`** lists what MediaLit made from the original, by name, with a status for each. A derivative has a `url` once it is `ready`, and the URL follows the file's access, like `file`. `thumbnail` is the same image as the `thumbnail` field. Sealed videos also get `mp4` or `hls`, as the app's [`videoStreaming`](#video-streaming) asks. A derivative is `queued` until it is made.

A sealed video is `processing` until its poster and its MP4 or HLS are done, then `ready`. A failed poster, or video processing refused by a limit (out of processing minutes, too large or too long), leaves the file usable: the derivative is `failed` with its reason, `processing.error` says why, and the file's status is still `ready`.

```json
{
    "processing": { "status": "ready" },
    "derivatives": {
        "thumbnail": {
            "status": "ready",
            "url": "https://…/thumb.webp",
            "mimeType": "image/webp",
            "size": 2048
        }
    }
}
```

Derivatives other than thumbnails count toward your storage.

### Playing videos

[`MediaLitVideo`](/docs/react#medialitvideo) handles all of this for React apps. Any other player works too, because everything it needs is in the media response:

- **Pick a source.** Play `derivatives.hls.url` when `derivatives.hls.status` is `ready`, else `derivatives.mp4.url` when that is `ready`, else `file`. A `<video>` element plays the MP4 and the original as they are.
- **Play HLS** with hls.js, Video.js, Shaka Player or another player built on Media Source Extensions in browsers, and with the built-in player on iPhone (Safari) and in native apps (AVPlayer, ExoPlayer). Desktop Chrome and Edge report built-in HLS support, but it can fail without an error, so prefer a Media Source Extensions player there.
- **Don't store private URLs.** The playlist link of a private video expires (the video's length plus an hour), like `file`. Fetch the media again when you need to play it.
- **Self-hosted:** browser players built on Media Source Extensions need [CORS on your storage](/docs/self-hosting#allow-players-to-read-video-segments). Native players don't.

With hls.js:

```js
import Hls from "hls.js";

const video = document.querySelector("video");
const hls = media.derivatives?.hls;
const fallback =
    media.derivatives?.mp4?.status === "ready"
        ? media.derivatives.mp4.url
        : media.file;

if (hls?.status === "ready" && Hls.isSupported()) {
    const player = new Hls();
    player.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
            player.destroy();
            video.src = fallback;
        }
    });
    player.loadSource(hls.url);
    player.attachMedia(video);
} else if (
    hls?.status === "ready" &&
    video.canPlayType("application/vnd.apple.mpegurl")
) {
    video.src = hls.url; // iPhone
} else {
    video.src = fallback;
}
```

## Limits

Your plan sets the largest file you can upload and your total storage. Uploads that would go over either limit are refused with a message you can show to the user. When you [self-host](/docs/self-hosting), you set the limits yourself.
