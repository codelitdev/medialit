---
"@medialit/api": minor
"@medialit/web": minor
"medialit": minor
"@medialit/cli": minor
---

A new media setting, `generateCaptions` (off by default), in the REST API, the MCP server, the SDK, `medialit settings set --captions` and a **Captions** card in the dashboard. Settings report `captionsAvailable`, false when no transcription worker is running. Seals can override it per upload (`processing.generateCaptions`, `--captions` on `upload` and `seal`). Captions never hold up a file's processing status: they report through a new opt-in webhook, `media.captions.ready`, sent only to endpoints that list it. Workers gain a `transcribe` job class, served only when `WORKER_CLASSES` lists it (`WORKER_CONCURRENCY_TRANSCRIBE`, default 1). Captions themselves are made in a later release.
