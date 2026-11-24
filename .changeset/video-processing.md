---
"@medialit/api": minor
"@medialit/react": minor
"@medialit/web": minor
"medialit": minor
"@medialit/cli": minor
---

Video processing. Two new media settings, `videoStreaming` (`off`, `hls` or `mp4`) and `hlsRenditions`, are in the REST API, the MCP server, the SDK (`getSettings` and `updateSettings`), the new `medialit settings` command and the dashboard's Media tab. Each app chooses for itself, and every app starts `off`. Storage stats everywhere now include the month's video processing minutes. `MCP_RATE_LIMIT_PER_MINUTE` sets the MCP server's per-client limit (60 by default).

- **Posters.** Sealed videos get a poster from about 10% in (at most 10 seconds), skipping dark frames, published over the video's `thumb.webp`, so saved thumbnail URLs show it. A sealed video is `processing` until its derivatives settle, then a `media.processing.ready` webhook fires. A failed poster keeps the upload thumbnail and still settles the media `ready`.
- **MP4** (`videoStreaming: "mp4"`): the `mp4` derivative, H.264 and AAC with the index at the front. Web-ready sources are remuxed in seconds and cost no minutes; others are re-encoded at most at 1080p, never upscaled.
- **HLS** (`videoStreaming: "hls"`): the `hls` derivative, the renditions in `hlsRenditions` that aren't larger than the video, in 6-second fMP4 segments. `derivatives.hls.url` is the master playlist: a storage URL for public videos, and a signed API URL (`/media/:mediaId/hls/:token/master.m3u8`) for private ones.
- **Player.** `@medialit/react` gains `MediaLitVideo`, which plays HLS (natively or with hls.js, loaded only when needed), then the web MP4, then the original. The dashboard's file preview uses it.

Workers run a new `video` job class, and a `video_queue_lag` alert pages when a video job waits more than 6 hours. Self-hosted installs need a bigger worker and a CORS rule on storage; see the [v0.8.x to v0.9.0 upgrade guide](https://medialit.cloud/docs/upgrade-from-v0-8-x-to-v0-9-0) for the settings and limits.
