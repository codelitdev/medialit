---
"@medialit/api": minor
---

Uploads now stream straight to the bucket as S3 multipart uploads, for both regular and resumable (tus) uploads, instead of being written to the server's disk first. Resumable uploads can continue on any API instance. A rejected or abandoned upload leaves nothing in the bucket. With WebP on, only the WebP file is kept and its size is what counts toward storage. Resumable uploads must now declare their size up front. Part size and concurrency are set with `UPLOAD_PART_SIZE_BYTES` and `UPLOAD_PART_CONCURRENCY`.
