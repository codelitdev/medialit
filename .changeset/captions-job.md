---
"@medialit/api": minor
"@medialit/web": minor
"@medialit/models": minor
"medialit": minor
"@medialit/react": minor
"@medialit/cli": minor
---

Captions are made. With `generateCaptions` on, sealed videos and audio files get a `captions` derivative: WebVTT captions (`url`, also `files.vtt`), a plain transcript (`files.text`) and a JSON transcript with timed segments (`files.json`), plus the spoken `language`. They are transcribed by the transcription worker, count the file's length in processing minutes, and fail with `no_audio_stream` for a file with no audio. `MediaLitVideo` shows them as a `<track>` and now forwards a `ref` to its `<video>` element. The dashboard's file details show the captions and link the files, and `medialit get` notes them on stderr. A new alert, `captions_volume`, emails at most once a day when more than `CAPTIONS_DAILY_MINUTES_ALERT` minutes are captioned in 24 hours.
