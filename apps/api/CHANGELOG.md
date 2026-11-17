# @medialit/api

## 0.5.0

### Minor Changes

- 3f1e412: Uploads now stream straight to the bucket as S3 multipart uploads, for both regular and resumable (tus) uploads, instead of being written to the server's disk first. Resumable uploads can continue on any API instance. A rejected or abandoned upload leaves nothing in the bucket, and every upload is recorded as it starts, so the temp cleanup job also removes what a server crash leaves behind. With WebP on, only the WebP file is kept and its size is what counts toward storage. Resumable uploads must now declare their size up front. Part size and concurrency are set with `UPLOAD_PART_SIZE_BYTES` and `UPLOAD_PART_CONCURRENCY`. Requests no longer time out after five minutes; a connection is closed only after `REQUEST_IDLE_TIMEOUT_MS` with no data. Regular uploads per process are capped by `MAX_CONCURRENT_FORM_UPLOADS`, answering 503 with `Retry-After` over the cap. An upload a crash interrupts is cleaned up after `UPLOAD_STALE_MINUTES` (30) with no activity; resumable uploads stay resumable until they expire.

## 0.4.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.0.28

### Patch Changes

- Updated dependencies [4c480c7]
    - @medialit/thumbnail@0.0.28
    - @medialit/images@0.0.26

## 0.0.27

### Patch Changes

- Updated dependencies [0ecea51]
    - @medialit/thumbnail@0.0.27

## 0.0.26

### Patch Changes

- Updated dependencies [bbb81e7]
    - @medialit/thumbnail@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [7a07e615]
    - @medialit/thumbnail@0.0.25
    - @medialit/images@0.0.25
