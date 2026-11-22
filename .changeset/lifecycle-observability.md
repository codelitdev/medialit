---
"@medialit/api": patch
"@medialit/web": patch
---

Product events and log lines for the media lifecycle, through `@codelitdev/observability`: uploads, seals, processing results, deletes, webhook deliveries, webhook endpoint changes and media settings changes. Events carry only IDs, kinds, counts, sizes and durations, never file names, URLs or secrets. The dashboard identifies the signed-in user by ID so its events join the API's. The Codelit platform packages move to 0.15.0.
