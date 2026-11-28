---
"@medialit/api": minor
---

A new image, `codelit/medialit-transcribe`, for the transcription worker: the API image plus faster-whisper and the `large-v3-turbo` model (int8, pinned), running the worker for the `transcribe` job class. `docker-compose.yml` runs it behind the `captions` profile (`docker compose --profile captions up -d`). See Self-hosting › Run the transcription worker.
