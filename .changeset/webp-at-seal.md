---
"@medialit/api": minor
"@medialit/images": minor
"@medialit/thumbnail": minor
---

WebP conversion moves from upload to seal. For apps with WebP on, the upload response now reports the original file, its MIME type and its uploaded size; the seal response reports the WebP. Temporary uploads that are never sealed are not converted, and a failed or skipped conversion keeps the original instead of failing the request (`processing.status` is `failed` for a failed conversion, and `processing.error` gives the reason in both cases). Concurrent seals of the same media convert it once; a second seal waits up to `SEAL_WAIT_MS` and then answers 503 with `Retry-After`.

Conversion is bounded by `WEBP_MAX_INPUT_BYTES`, `WEBP_MAX_PIXELS` (read from the header without decoding), `WEBP_MAX_MEMORY_MB` (`prlimit --as`), `WEBP_TIMEOUT_MS` (kills the whole process group) and `WEBP_CONCURRENCY`/`WEBP_QUEUE_WAIT_MS`. These limits live in `@medialit/images`, which replaces `convertToWebp(path, quality)` with a limited `convertToWebp(input, output, options)` and adds `readImageInfo`, `checkImageFile`, `runLimited` and `Slots`.

Image and video thumbnails follow the app's `thumbnailWidth` × `thumbnailHeight` (resized and cropped) when the app has set them; apps that never set them keep today's thumbnails (images cropped to 16:9, at most 480 px tall; videos 720 px tall), and 1-pixel-tall images now get a thumbnail too. `@medialit/thumbnail`'s `forImage` and `forVideo` take an optional size as a third argument, and the `generate-thumbnail` script is removed.
