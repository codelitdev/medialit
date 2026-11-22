---
"@medialit/api": minor
---

Sealed videos get a poster: a frame from about 10% in (at most 10 seconds), skipping dark frames, made by the worker and published over the video's `thumb.webp`, so saved thumbnail URLs show it with no change. A sealed video is now `processing` until the poster is ready, and a `media.processing.ready` webhook fires when it is. A failed poster keeps the upload thumbnail and still settles the media `ready`. Workers run a new `video` job class (`WORKER_CONCURRENCY_VIDEO`, 1 by default), and a `video_queue_lag` alert pages when a video job waits more than 6 hours.
