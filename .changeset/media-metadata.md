---
"@medialit/api": minor
"medialit": minor
---

Media responses gain `metadata`: duration, size as displayed, rotation, frame rate, codecs, bitrate, sample rate, channels and format, read when the media is sealed (ffprobe for audio and video, the header for images). It is `null` before seal, or when the file can't be read; seal never fails because of it and waits at most 2 seconds for it. When seal runs out of time for a video, for example a phone recording whose index is at the end of the file, the video's poster job reads the metadata and fills it in. Logs no longer include presigned URLs from failed thumbnails or metadata reads.
