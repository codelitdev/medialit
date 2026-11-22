---
"@medialit/api": minor
---

`videoStreaming: "mp4"` makes an MP4 optimized for the web, the `mp4` derivative: H.264 and AAC with the index at the front. Sources that are already web-ready are rewritten in seconds and cost no processing minutes; others are re-encoded at most at 1080p, never upscaled. Encodes download the source first, refuse sources over `VIDEO_MAX_SOURCE_BYTES` (1 GB) or `VIDEO_MAX_DURATION_SECONDS` (2 hours), run under `VIDEO_MAX_MEMORY_MB`, and give minutes back when they fail.
