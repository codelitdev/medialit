---
"@medialit/api": minor
"@medialit/react": minor
"@medialit/web": minor
---

`videoStreaming: "hls"` makes HLS with adaptive bitrate, the `hls` derivative: one ffmpeg run makes the renditions in `hlsRenditions` that aren't larger than the video, as H.264/AAC in 6-second fMP4 segments. `derivatives.hls.url` is the master playlist: a storage URL for public videos, and for private videos a signed API URL (`/media/:mediaId/hls/:token/master.m3u8`) that signs each segment for the length of the video plus an hour. `@medialit/react` gains `MediaLitVideo`, which plays HLS (natively or with hls.js, loaded only when needed), then the web MP4, then the original; the dashboard's file preview uses it. Storage needs CORS for `GET` from any origin so hls.js can read segments.

Encodes stay within `VIDEO_MAX_WORK_BYTES` of temporary disk (10 GB by default): a video whose source and worst-case output wouldn't fit is refused with `source_too_long` before it is charged, and the output is capped to what fits. At the bitrate caps an HLS ladder is about 4.3 GB per hour, so give the worker about 12 GB of temporary disk.
