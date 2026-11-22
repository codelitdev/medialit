---
"@medialit/api": minor
"medialit": minor
---

Media responses gain `metadata`: duration, size as displayed, rotation, frame rate, codecs, bitrate, sample rate, channels and format, read when the media is sealed (ffprobe for audio and video, the header for images). It is `null` before seal, or when the file can't be read; seal never fails because of it and waits at most 2 seconds for it. Logs no longer include presigned URLs from failed thumbnails or metadata reads.
