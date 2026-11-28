---
"@medialit/api": minor
"medialit": minor
"@medialit/cli": minor
---

Sealing can override the app's processing settings for one upload: `POST /media/seal/{mediaId}` takes an optional `processing: { videoStreaming }`, and so do MCP's `seal_media`, the SDK's `seal(mediaId, { processing })` and the CLI's `upload` and `seal` (`--video-streaming`). A field left out uses the app's setting, and sealing again ignores it. Use it to process some users' videos and not others, for example to skip HLS for trial accounts.
