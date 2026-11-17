---
"@medialit/uploader": minor
---

Files now upload in 48 MiB chunks by default instead of one request, so big uploads survive proxy and server timeouts and resume from the last chunk after a dropped connection. Pass `chunkSize` to change it. Uploads also retry when the server answers 408 (request timeout) or 429 (rate limited).
