# Pipelines phase 2: transcription and captions

**Issue:** #259 (part of #247). Sub-issues: #266 (audio extraction), #269 (transcription and captions).

**Status:** Decisions made in review (section 12). The benchmark (D5) chose faster-whisper with `large-v3-turbo` int8 and set the price of a caption minute.

## 1. Goal

Transcribe the audio of videos and audio files, and turn it into captions (WebVTT) and a transcript. Transcription runs on Whisper in MediaLit's own pods, with no hosted AI provider and no API key, so self-hosted installs and the cloud work the same, and audio never leaves the cluster.

One media setting controls it: `generateCaptions` (`boolean`, default `false`). Audio extraction is an internal step with no setting. It runs when captions need it.

When the video also has HLS (phase 1), the captions are added to the HLS playlist as a subtitle track.

## 2. What exists after phase 1

- **Seal plans the jobs** (`apps/api/src/media/processing-plan.ts`) and queues them in its commit transaction (`afterSealCommit`), each with a `queued` derivative row and its settings copied into `params`. Jobs are independent: nothing waits for another derivative.
- **Derivative jobs** use `derivativeJob()`. `finishDerivative` records the result under the media row lock, queues `media.publish` for public media, and settles the media when no derivative is `queued` or `processing`.
- **The reconciler** (`media.processing_reconcile`, every 5 minutes) fails a derivative that has been `queued` or `processing` for 10 minutes with no queued or running job for it.
- **Settling (D12 of phase 1):** a failed poster, or HLS or MP4 refused by a limit (`out_of_processing_minutes`, `source_too_large`, `source_too_long`), leaves the media `ready`. Any other failed derivative settles it `failed`.
- **Job classes:** `cpu` (default: the number of cores), `io` (16) and `video` (1). `WORKER_CLASSES` chooses which a worker serves. The worker in QA and prod has 2 CPU, 2 GiB and 12 GiB of temp disk.
- **The shared video job code** (`video-job.ts`) checks the source size, downloads the original to a work directory, probes it, reserves minutes, runs ffmpeg locally under `prlimit` with a timeout, uploads, and removes the work directory. It separates permanent failures from retried ones.
- **Processing minutes** (`processing_usage`): reserved when an encode starts, keyed by job ID, released when it fails for good. 5 a month free, 300 paid, unlimited self-hosted. Rows have a `kind` (`hls`, `mp4`).
- **HLS:** public media plays its `hls/master.m3u8` from the CDN. Private media plays through the API: `/media/{mediaId}/hls/{token}/master.m3u8` is served unchanged, and each rendition playlist is rewritten with signed segment URLs.
- **`metadata.audioCodec`** is absent when the file has no audio stream, or when the 2 s probe at seal couldn't tell. The poster job fills in metadata that seal missed.
- **Bucket CORS** (`GET`, `HEAD` from any origin) is on both buckets and the CDN, which `<track>` elements also need.
- **`@medialit/react`** has `MediaLitVideo`, which plays HLS, then MP4, then the original.

## 3. Decisions

### D1. One media setting, per app

| Setting            | Values    | Default |
| ------------------ | --------- | ------- |
| `generateCaptions` | `boolean` | `false` |

- Every app starts `false`, existing and new, as `videoStreaming` does (phase 1, decision 9). An admin turns it on for the apps that need it. Null means `false`, so no backfill is needed.
- It applies to video and audio uploads sealed afterwards. Seal copies it into the job's params.
- It is independent of `videoStreaming`. With streaming `off`, captions still attach to the original and the MP4 through `<track>` (D8).
- **Language is detected**, not set. A `captionsLanguage` setting can come later if detection isn't good enough (#269).
- The free plan can turn it on. It then uses its free minutes (D9).

### D2. Derivatives can wait for another derivative

Captions are made from the extracted audio, so the captions job can't start until the audio job is done. Phase 1 has no way to express that, and the reconciler would fail a `queued` derivative that has no job while it waits.

- A planned job can name the derivative it needs: `after: "audio"`. Seal inserts its derivative row as `queued` with `params.after`, but doesn't queue its job.
- When the derivative it waits for finishes, `finishDerivative` (holding the media row lock) queues the waiting jobs if it is `ready`, or fails their derivatives with `audio: <error>` if it `failed`. Both happen in the same transaction, so a waiting derivative is never left `queued` without a job once the one it waits for has settled.
- **The reconciler** doesn't count a derivative as orphaned while the one it waits for is `queued` or `processing`. Once that one has settled and the waiting derivative is still `queued` with no job (a crash between commits can't cause it, but a cancelled job can), it fails it as today.
- Only one level is needed now (audio, then captions). The mechanism doesn't limit it, but a derivative may only wait for one planned in the same seal.

Alternative rejected: **one job that extracts and transcribes.** It would hold a transcription slot during the extraction, and a retry would extract again. Another rejected: queuing the captions job at seal with a delay and retrying until the audio is there. It wastes attempts and has no upper bound.

### D3. Audio extraction (#266)

- Job `media.audio`, class `video` (D6 covers why not `cpu`), derivative `audio`, key `audio.m4a`, `audio/mp4`.
- **Only when captions need it:** a sealed video with `generateCaptions` on. Audio uploads don't need it: captions read the original.
- **Input:** the original, downloaded as the video jobs do (size check first, then a local copy, phase 1 D4), with the same limits: `VIDEO_MAX_SOURCE_BYTES` and `VIDEO_MAX_DURATION_SECONDS`.
- **Output:** the first audio stream, mapped explicitly (`-map 0:a:0 -vn -sn -dn -map_metadata -1`), with `+faststart`:
    - **Copied** (`-c:a copy`) when it is AAC. Seconds, and no loss.
    - **Otherwise encoded** to AAC-LC 128 kbps stereo, 48 kHz.
- **No audio stream** (the probe in the job finds none): the job fails `audio` with `no_audio_stream`, and with it the captions (D2). Both leave the media `ready` (D10). When seal's metadata already shows no audio, seal doesn't plan either job.
- **Internal and temporary** (section 12, decision 2). The audio exists only as the captions job's input. It is never published, and it isn't in the media response or the webhook payload. When `captions` settles (ready, or failed for good, including by the reconciler), the same transaction deletes the `audio` row and, after the commit, its file. While it exists it counts towards storage, like any derivative, for the few minutes it lives.
- **Not metered:** a copy takes seconds, and an encode is a small fraction of a video encode.

### D4. Transcription runs in a separate Whisper service

- Whisper runs as its own deployment, `medialit-whisper`, with an HTTP API on the cluster network only (a `ClusterIP` service and a network policy that admits only the worker). It has no authentication: nothing outside the cluster can reach it.
- **The model is baked into the image** (`codelit/medialit-whisper`, built and pushed by CI like the API image, with the runtime and model versions pinned). Pods don't download anything at start, and self-hosted installs pull one image. Mounting the model from a volume is the fallback if the image gets too large to pull quickly.
- **The model loads on the first request and unloads after 10 minutes idle** (`WHISPER_IDLE_UNLOAD_SECONDS`, default 600). Loading took 10 to 16 seconds on the QA node, small next to a chunk's transcription, and an idle pod then holds about 100 MB instead of about 1.9 GB. That is what lets the service share a node with the apps while there is little caption traffic (D5). The health route answers whether the model is loaded or not, so readiness doesn't depend on it.
- **It reports what capacity planning needs** (D5, section 7). Each response, and the health route, carries an `instance_id` made at process start, so the worker sees restarts. A transcribe response also carries `load_ms` when it loaded the model, and the node's CPU steal while it transcribed, from `/proc/stat` (node-wide, not per container). A burstable instance out of CPU credits shows up as steal.
- **The worker sends it audio and gets segments back.** The TypeScript side converts, chunks, retries, stores and meters. The service only transcribes.
- **Provider interface** (`apps/api/src/transcription/`):

    ```ts
    type TranscribeInput = {
        wavPath: string; // 16 kHz mono PCM, one chunk
        language?: string; // ISO 639-1, once detected
        signal: AbortSignal;
    };
    type TranscribeResult = {
        language: string; // detected or as given
        segments: { start: number; end: number; text: string }[]; // seconds, relative to the chunk
        stats?: {
            instanceId?: string; // changes when the service restarts
            loadMs?: number; // set when this request loaded the model
            cpuStealPct?: number; // the node's CPU steal while transcribing
        };
    };
    interface TranscriptionProvider {
        name: string; // "faster-whisper"
        model: string; // e.g. "large-v3-turbo-int8"
        transcribe(input: TranscribeInput): Promise<TranscribeResult>;
    }
    ```

    `TRANSCRIPTION_PROVIDER` picks it (default `faster-whisper`, D5) and `WHISPER_URL` points to the service. A hosted provider such as ElevenLabs Scribe can be added later behind the same interface without touching the job.

- **Without `WHISPER_URL`** (a self-hosted install that didn't add the service), captions fail with `transcription_unavailable` and the media stays `ready`. The settings routes and the dashboard say so when `generateCaptions` is on and the API has no `WHISPER_URL`. The API and the worker read the same environment in our deployments; the docs say both need it.

### D5. Runtime and model: faster-whisper, `large-v3-turbo` int8

The first task of #269. Compared on the QA node, with English, Spanish and Hindi speech and a stretch of music and silence (results below):

| Runtime                        | Notes                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| whisper.cpp (`whisper-server`) | C++, HTTP built in, no Python, small image. Silero VAD built in (`--vad`). Quantized models (`q5_0`, `q8_0`).                |
| faster-whisper (CTranslate2)   | Python, int8 on CPU, Silero VAD built in (`vad_filter`). Needs a small HTTP wrapper of our own, which we'd have to maintain. |

Whisper models: `large-v3-turbo` and `medium`, quantized where the runtime supports it.

**Whisper only in this phase** (section 12, decision 1). Rumble-2-Flash (Reson8, open weights) was considered and left for a later iteration: it returns no timestamps, has no VAD and has no maintained CPU server. The provider interface (D4) leaves room for it.

Measured, for each runtime and model: real-time factor (seconds of audio per second) on the worker's CPU, memory, and accuracy (word error rate against a hand-corrected transcript, plus a manual check of the captions' timing), with and without VAD, and its output on a stretch of music and of silence.

**Benchmark** (2026-11-27, on the QA node: a t4g.medium, 2 vCPU Graviton2 at 4 GiB, with QA's apps scaled down; 2 threads; `large-v3-turbo`; VAD on unless noted; beam size 5). Inputs from public datasets with reference transcripts: one 15-minute TED-LIUM talk (spontaneous English), about 5 minutes each of FLEURS English, Spanish and Hindi (read speech), and 2 minutes of the talk followed by 90 s of synthetic music and 90 s of silence. No CPU time was stolen, so the burstable instance didn't throttle. The node was stopped by spot interruptions four times during the runs; each run restarted cleanly.

|                                                | faster-whisper 1.2.1, int8 | whisper.cpp 1.9.6, q8_0                           |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------- |
| TED talk, word error rate                      | **5.5%**                   | 5.9%                                              |
| FLEURS English, word error rate                | **16.0%**                  | 24.5%                                             |
| FLEURS Spanish, word error rate                | 2.3%                       | **1.5%**                                          |
| FLEURS Hindi, character error rate             | **26.5%**                  | 45.2%                                             |
| Real-time factor: TED, English, Spanish, Hindi | **0.89, 0.84, 0.83, 2.36** | 1.59, 1.25, 1.49, 2.70                            |
| CPU seconds per minute of audio: TED, Hindi    | **96, 245**                | 176, 300                                          |
| Peak memory                                    | 1.9 GB                     | **1.4 GB**                                        |
| Music and silence, VAD on: words invented      | **0**                      | 0, but a real sentence was timed inside the music |
| Music and silence, VAD off: words invented     | 11 ("Thank you" ×5)        | 46 ("you" ×45)                                    |

- **whisper.cpp drops speech.** Most of its errors are deletions (91 of 613 words in FLEURS English, 448 of 1108 in Hindi), including a 20-second hole, which a caption track would show as missing captions.
- **whisper.cpp q5_0 is not an option on Arm:** 251–261 s for 60 s of audio, against 101 s for q8_0. Greedy decoding saved only 10%.
- **VAD is required.** Without it, both invent text in music and silence.
- **Hindi is slow and weak on both** (about 2.4× real time, 26% character error rate). The FLEURS English rate is high for both because its read sentences are short and full of names and numbers; the long-form TED talk is the closer match to course videos.

**Decision: faster-whisper with `large-v3-turbo` int8 and its Silero VAD.** It is more accurate, about 1.8× faster, and drops less speech. What it costs: a small HTTP wrapper of our own (`apps/whisper/`, Python, about a hundred lines: one `POST /transcribe` taking a WAV and returning `language` and `segments`, and `GET /health`), pinned with its dependencies in the image. faster-whisper 1.2.1 can't read files with PyAV 17 (`av.open` lost `metadata_errors`), so the wrapper decodes the WAV itself and passes samples; the image pins PyAV anyway.

**Sizing.** On 2 Graviton2 cores, faster-whisper runs at about 0.9× real time for English: one replica keeps up with about 25 hours of uploaded audio a day, less for languages such as Hindi. There is no caption traffic yet (captions are new and off by default, D1), so **the first version runs on the existing nodes**, in QA and prod, with no new node:

- the model unloads when idle (D4), so an idle replica costs about 100 MB;
- the pod requests little (0.25 CPU, 512 MiB) and is limited to 2 CPU and 2.5 GiB, with a priority class below the apps. Under memory pressure the kubelet evicts it before any app, and the captions job retries and resumes from its progress files (D7);
- a few videos a day stay well inside a t4g's CPU credits. Hours of steady transcription would not: the burstable instance would throttle and slow the apps sharing it.

**Moving to a dedicated node** (non-burstable, for example a c7g.large, with the service pinned to it) happens when any of these shows up. Each has an event and an alert (section 7):

| Signal                                                                                                                                                                                                                                                                                                                   | Seen through                                                               | Alert                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------- |
| captions wait too long                                                                                                                                                                                                                                                                                                   | the oldest queued `transcribe` job                                         | `transcribe_queue_lag` |
| more than about 2 hours of audio/day                                                                                                                                                                                                                                                                                     | caption minutes in `processing_usage`, in `captions.daily`                 | `captions_volume`      |
| the node runs out of CPU credits                                                                                                                                                                                                                                                                                         | `cpu_steal_pct` on `captions.made`, and `speed` falling for the same audio | `whisper_throttled`    |
| the Whisper pod keeps restarting                                                                                                                                                                                                                                                                                         | `whisper.restarted` (its `instance_id` changed)                            | `whisper_restarts`     |
| It is a change to the deployment's node selector and requests, not to the code. Scaling past 2 threads wasn't measured, because the QA node has 2 cores; it is measured on the dedicated node when one is added. The job timeouts (D7) use 3× the audio's duration, which covers Hindi's 2.4× with room for a busy node. |

### D6. A `transcribe` job class

- One transcription can take about as long as the audio. It must not hold up image and video jobs, and they must not hold it up.
- New class `transcribe`, default concurrency 1, set with `WORKER_CONCURRENCY_TRANSCRIBE`. It should equal the number of Whisper replicas: the work happens in the Whisper pods, and the worker only converts chunks and waits. More concurrency than replicas only queues requests inside the service, where nothing tracks them.
- The worker's own share is small: ffmpeg converting the audio to 16 kHz mono WAV (about 115 MB per hour) and the HTTP calls. So the job runs in the existing worker; no second worker deployment is needed. `WORKER_CLASSES` can still move it to one later.
- **Audio extraction is `video`, not `cpu`:** it reads the same large originals as the encodes and needs the same temp disk budget, which the `video` slot already accounts for. A copy takes seconds, so it barely delays encodes. Paid and self-hosted jobs run first (phase 1, D11).
- **Scaling** on queue length (KEDA or a similar autoscaler on the count of queued `transcribe` jobs) is out of the first version. One Whisper replica first, sized by the benchmark.

### D7. What a captions job does

Job `media.captions`, class `transcribe`, derivative `captions`.

1. **Gets its input:** the `audio` derivative for a video (deleted once captions settle, D3), or the original for an audio upload, downloaded to a work directory (size check first, as phase 1 D4).
2. **Probes it** and refuses sources over `CAPTIONS_MAX_DURATION_SECONDS` (default 7200, as for video) with `source_too_long`, or with no audio stream with `no_audio_stream`.
3. **Reserves minutes** for the whole duration (D9).
4. **Converts** to 16 kHz mono 16-bit PCM WAV with ffmpeg, local file only, under the same `runLimited` and allowlist as the encodes.
5. **Splits into chunks** of about 5 minutes, cut at silences: ffmpeg's `silencedetect` (`-af silencedetect=n=-35dB:d=0.4`) lists the silences, and each cut goes at the middle of the silence nearest the 5-minute mark, between 4 and 6 minutes. With no silence in that window, the cut is at 5 minutes. Cuts depend only on the audio, so every attempt cuts the same way.
6. **Transcribes chunk by chunk**, saving each result before the next (resume, below). The first chunk that has speech fixes the language; later chunks pass it, so a chunk of music or a quote in another language doesn't switch it. Segment times are shifted by the chunk's start.
7. **Writes the outputs** (D8) under `captions/`, uploads them, and finishes the derivative.

**Voice activity detection** runs in the service (faster-whisper's `vad_filter`, with the Silero model), so Whisper never sees long silence or music, where it tends to invent text (for example "Thanks for watching!"). The worker also drops any segment whose text is empty, or which repeats the previous segment's text more than twice in a row, a known Whisper failure.

**Resume after an interruption.** Nodes are spot instances, and a deploy puts running jobs back in the queue (phase 0). After each chunk, its segments go to `captions/.progress/chunk-{nnnn}.json` in the private bucket, with the chunk's start, end and the language. A retried or restarted job lists them, skips the chunks done (only if the cut points match, which they do for the same input), and continues. The progress files are deleted when the outputs are written, and with the media's folder on delete. Minutes reserved by the first attempt are kept: the reservation is per job (phase 1, D8).

**Timeouts.** Each chunk request times out after `max(2 min, 2 × chunk length)` (set from the benchmark). The job's own limit is `max(15 min, 3 × duration)`, enforced by the job as video jobs do, with the job type's `timeoutMs` set to the largest possible value.

**Retries.** Like every other derivative job, a captions job is retried before it fails (section 12, decision 5). It gets 5 attempts, more than encodes' 3, because progress is kept and the service is a network hop. Attempts back off as the queue's other retries do, so a Whisper pod that restarts has time to come back.

- **Permanent:** limits (`source_too_long`, `source_too_large`, `no_audio_stream`, `out_of_processing_minutes`), ffmpeg exiting with an error on our local file (`bad_input`), `transcription_unavailable`, and the job's timeout.
- **Retried:** the service unreachable, a 5xx, a chunk request timing out, storage and database errors. A chunk that fails three times in one attempt fails the attempt.

### D8. Outputs, and how players use them

Under the media's folder, as one derivative with key `captions/`:

| File                       | Contents                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captions/captions.vtt`    | WebVTT. Cues of at most 2 lines of 42 characters and 7 seconds, split at segment and word boundaries.                                                                                 |
| `captions/transcript.txt`  | Plain text, one paragraph per pause of 2 s or more.                                                                                                                                   |
| `captions/transcript.json` | `{ version: 1, language, durationSeconds, provider, model, segments: [{ id, start, end, text }] }`. Times in seconds with millisecond precision; `id` is the segment's index, from 0. |

- **The media response:** `derivatives.captions` gets `url` (the VTT), `language` (ISO 639-1), and `files: { vtt, text, json }` with a URL for each. `MediaDerivative` gains the two optional fields; `files` is also how other outputs with several files can expose them later. URLs are signed for private media, as for any derivative.
- **The size** is the sum of the three files.
- **Public media:** published like other derivatives.
- **`MediaLitVideo`** adds `<track kind="captions" srclang={language} src={derivatives.captions.url} crossorigin>` when it plays the MP4 or the original. With HLS, the track comes from the playlist (below) instead, so it isn't shown twice. An audio player isn't part of this phase.
- **What apps build on it.** The outputs are meant for more than captions on a player: a transcript beside the video that highlights the line being spoken and seeks when a line is clicked, search within a lesson, and an app's own corrected copy. What MediaLit guarantees for that:
    - `transcript.json` is the contract for apps. Its segments are in order, don't overlap, and their times are from the start of the media (chunk offsets already applied, D7). `id` is stable for that file, so an app can anchor notes or corrections to a segment. `version` changes only on a breaking change; new fields (word-level times, later) are added without one.
    - The VTT's cues come from the same segments, split for display, so the transcript and the captions never disagree on what was said or when.
    - Both files are fetched straight from storage or the CDN with CORS (phase 1), signed for private media like any derivative URL.
    - **`MediaLitVideo` forwards a `ref` to its `<video>` element**, merged with the ref it uses internally, so an app can read `currentTime` and seek. Today a `ref` passed in would land in the spread props after the internal one and break hls.js. `onTimeUpdate` and the other `<video>` props pass through as today.
    - Apps learn that captions are ready from the `media.captions.ready` webhook (D10) or by reading the media.
- **Captions are never edited by MediaLit.** An app that wants to fix them stores its own copy. Uploading corrected captions is out of scope (section 11).

### D9. Processing minutes for captions

- **What counts:** the audio's duration, rounded up to whole minutes, once per captions job, with `kind = 'captions'` in `processing_usage`. Minutes of silence removed by VAD still count: the user can predict the charge from the file's length, and the service still has to read them.
- **The same monthly allowance** as video encodes (#247: processing is one meter). **One minute of audio costs one processing minute** (section 12, decision 3). On the QA node, transcription took 96 CPU seconds per minute of English audio (84 for Spanish, 245 for Hindi), and phase 1's three-rendition HLS ladder took 151 CPU seconds per minute of a synthetic 1080p source, which encodes more easily than real footage. Captions therefore cost about the same as encoding, or less, for most languages, and an MP4 re-encode is already charged one for one. One rate keeps the charge predictable. If Hindi-heavy accounts turn out to dominate, a per-language weight can come later.
- Reserved when the job starts, after the probe, kept across retries, released if the job fails for good, as phase 1 D8 does. The reconciler releases the minutes of a captions job whose worker died on its last attempt, as it does for encodes.
- **Out of minutes:** `captions` fails with `out_of_processing_minutes`, the media stays `ready` (D10), and `processing_minutes.exhausted` is sent once per account a month, as today.
- Audio extraction is not metered (D3).

### D10. Captions don't hold up the media, and have their own webhook

Captions and extracted audio add to a file that already plays. They can also take much longer than the encodes: one Whisper replica works through captions one at a time (D6), so a queue there could delay a video's `ready` by hours if the media waited for them.

- **`audio` and `captions` are background derivatives.** The media settles when every other derivative has settled, as phase 1 does, without waiting for them. `media.processing.ready` (or `failed`) fires then, and its payload shows `captions` as `queued` or `processing`.
- **They never change the media's status.** Whatever their error, the original, poster, HLS and MP4 are still there, so a failed `audio` or `captions` never makes the media `failed`, and their settling doesn't touch `processing_status`. `leavesMediaUsable` isn't consulted for them.
- **An audio upload with captions on settles at seal**, as it does today with nothing to process, and only its captions run afterwards. Clients see no change in how audio uploads settle.
- **New webhook `media.captions.ready`**, queued in the transaction that settles `captions`, ready or failed for good (including by the reconciler). Its payload has the same shape as the processing webhooks: `mediaId`, `appId`, the media's `status`, and `derivatives.captions` with its `status`, and its `error` when it failed. URLs aren't in webhooks (they are signed); the client reads the media. One event covers both outcomes, so a client handles one type. Endpoints receive it only when they subscribe to it (`WEBHOOK_EVENTS` gains it), so existing endpoints see nothing new.
- **The two webhooks can arrive in either order.** Captions for a short video can finish before its HLS encode. A client that wants captions listens for `media.captions.ready`; one that wants playback listens for `media.processing.ready`.
- The failure is still visible: the derivative is `failed` with its `error`, `processing.error` lists it, and `media.captions.ready` carries it. Operators notice failures that are ours from exceptions (7.3), not from the media status.

This extends phase 1's D12. Alternatives rejected: letting captions hold the media in `processing` (the delay above), and settling `failed` when captions fail (it would tell clients a lesson video is unusable because its captions failed).

### D11. Captions in HLS

When the media has both a ready `hls` and a ready `captions` derivative, the HLS master playlist lists the captions as a subtitle track, so hls.js and Safari show a captions menu:

```
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",AUTOSELECT=YES,DEFAULT=NO,URI="subs/index.m3u8"
#EXT-X-STREAM-INF:...,SUBTITLES="subs"
```

`subs/index.m3u8` is a VOD playlist with one WebVTT segment covering the whole video (`#EXT-X-TARGETDURATION` set to the duration, rounded up). Players accept it, and it avoids cutting the captions into segments. `NAME` is the language's English name.

The two derivatives finish in either order, so the playlist is changed by whichever path sees both ready:

- **Private media:** the API adds the lines when it serves `master.m3u8`, if `captions` is ready, and serves `subs/index.m3u8` at `/media/{mediaId}/hls/{token}/subs/index.m3u8` with the VTT's signed URL. Nothing stored changes. The token check and the rest of phase 1's D6 apply unchanged.
- **Public media:** the master playlist is a static file on the CDN, so a job rewrites it. `media.hls_subtitles` (class `io`) is queued, under the media row lock, by whichever of these comes second: `captions` becoming ready while `hls` is already public, or `media.publish` flipping `hls` to public while `captions` is ready. It runs only on public HLS, so it never races `media.publish` for the same files. It copies the VTT to `hls/subs/captions.vtt`, writes `hls/subs/index.m3u8`, and then writes the new `hls/master.m3u8`, in that order, so a player never sees a track whose files don't exist yet. It is idempotent: it rebuilds the master from the renditions' lines, not by appending.
- **The CDN** may serve the old master playlist, without the track, until `CDN_MAX_AGE` (1 hour) passes. Accepted for now (section 12, decision 4): no invalidation.
- If captions fail, the playlist is never changed.

### D12. Which jobs seal queues

Phase 1's D11, extended. "Audio known absent" means seal's metadata read the file and found no audio stream.

| Media                                            | Jobs                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| Video, captions off                              | as phase 1 (poster, plus HLS or MP4)                   |
| Video, captions on                               | as phase 1, plus audio, then captions (`after: audio`) |
| Video, captions on, audio known absent           | as phase 1                                             |
| Audio (`audio/*`, or a video type with no video) | captions, when on                                      |
| Image, anything else                             | none                                                   |

Audio and captions are background derivatives (D10): seal sets `processing_status = 'processing'` only for the others, so an audio upload with captions on settles at seal as today. Captions jobs use the same priority as video jobs (paid and self-hosted first).

## 4. Data model

```sql
media_settings
  + generate_captions  boolean          -- null = false (D1)

derivatives
  -- no change: params.after names the derivative a row waits for (D2),
  -- captions' language goes in params.language

processing_usage
  -- no change: kind gains 'captions'
```

No migration of existing rows.

## 5. Flows

**Seal:** as in phase 1, with the jobs from D12. A derivative that waits gets its row, not its job.

**Audio:** start the derivative, check the size, download, probe, copy or encode the audio, upload, finish. Finishing queues the captions job, or fails it if the audio failed (D2). When captions settle, the audio is deleted (D3).

**Captions:** start the derivative, get the input, probe, reserve minutes, convert, chunk, transcribe each chunk with progress saved, write the outputs, finish. On a permanent failure, release the minutes. Finishing may queue `media.hls_subtitles` (D11).

**Playback:** VTT through `<track>` for the original and the MP4; a subtitle track in HLS (D11).

**Delete:** unchanged. The prefix delete removes `audio.m4a`, `captions/` (with any progress files) and `hls/subs/`. A running transcription aborts on its next heartbeat; the request in flight to Whisper is cancelled with the job's signal. Usage rows stay.

## 6. API surface

These changes only add fields and routes.

- **Media settings** (REST, MCP, SDK): `generateCaptions`. The `GET` response adds `captionsAvailable: boolean`, false when the server has no transcription provider configured (D4).
- **Media response** (REST, MCP, CLI, `@medialit/models`): `derivatives.captions` with `url`, `language` and `files` (D8). The internal `audio` derivative is left out of responses and webhook payloads.
- **New route:** `GET /media/{mediaId}/hls/{token}/subs/index.m3u8` (D11), in the OpenAPI spec.
- **CLI:** `medialit settings set --captions <on|off>`. `medialit get <mediaId>` shows the captions' language and URL.
- **Dashboard:** a Captions card in the Media tab (a switch, the minutes it uses, and a note when the server has no transcription service). File details show the captions' status and language, link the VTT and transcript, and the preview shows the captions.
- **Webhooks:** new event `media.captions.ready`, sent when captions settle, ready or failed (D10). Subscribed to per endpoint, like the others, in REST, MCP (`create_webhook`, `update_webhook`) and the dashboard. `media.processing.ready` no longer waits for captions, and shows them as `queued` or `processing`.
- **`@medialit/react`:** `MediaLitVideo` forwards a `ref` to its `<video>` element (D8).
- The OpenAPI spec is regenerated.

## 7. Observability and operations

Through `@codelitdev/observability`, as phase 1 (section 7 there). Events carry only IDs, enums, counts, sizes and durations. **Never sent or logged: transcript text, captions, or anything derived from them other than the language code and counts.**

### 7.1 Events

| Event               | When                                                                            | Properties                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio.extracted`   | an audio job succeeds                                                           | `media_id`, `copied` (stream copy or encode), `source_duration_s`, `audio_codec`, `duration_ms`, `size_bytes`                                                                 |
| `captions.made`     | a captions job succeeds                                                         | `media_id`, `source`(`audio_upload` \| `video`), `language`, `provider`, `model`, `source_duration_s`, `chunks`, `cues`, `resumed`, `duration_ms`, `speed`, `minutes_charged` |
| `captions.failed`   | a captions job fails for good                                                   | `media_id`, `failed_reason`, `provider`, `source_duration_s`, `chunks_done`                                                                                                   |
| `whisper.restarted` | the worker sees a new `instance_id` from the service (health check or response) | `previous_instance_id`, `instance_id`, `during_job` (a chunk was in flight), `uptime_s` of the previous instance when known                                                   |
| `captions.daily`    | once a day, from the worker holding the alerts lock                             | `jobs`, `failed`, `audio_minutes`, `median_speed`, `p95_queue_wait_s`, `max_cpu_steal_pct`, `whisper_restarts`, `model_loads` (all over the last 24 hours)                    |

`captions.made` also carries `cpu_steal_pct` (the highest over its chunks) and `model_loads` (chunks that loaded the model), from the service's `stats` (D4). `captions.daily` is what the capacity dashboard reads; `operations.page` covers the alerts below.

`media_settings.updated` gains `generate_captions`.

### 7.2 Logs

| Message                        | Level | Extra fields                                                                                 |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------------- |
| `audio extracted`              | info  | `copied`, `source_duration_s`, `duration_ms`, `size_bytes`                                   |
| `captions chunk transcribed`   | debug | `chunk`, `chunks`, `chunk_duration_s`, `duration_ms`, `segments`, `cpu_steal_pct`, `load_ms` |
| `whisper restarted`            | warn  | `previous_instance_id`, `instance_id`, `during_job`, `uptime_s`                              |
| `captions resumed`             | info  | `chunks_done`, `chunks`                                                                      |
| `captions made`                | info  | `language`, `chunks`, `cues`, `source_duration_s`, `duration_ms`, `speed`                    |
| `transcription request failed` | warn  | `chunk`, `status_code` or `error_class`, `attempt`                                           |
| `waiting derivatives released` | info  | `derivative`, `after`, `status` (queued or failed, D2)                                       |
| `hls subtitles added`          | info  | `language`, `duration_ms`                                                                    |

### 7.3 Exceptions

- **No exception** for `no_audio_stream`, `source_too_long`, `source_too_large`, `out_of_processing_minutes`, `bad_input` and `transcription_unavailable`. They are the tenant's input or the server's configuration, and are shown on the media.
- `critical` for a captions job that fails for good after retries because the service kept failing, and for `db`, `storage` and `internal`, as today.
- New source `api.hls_subtitles` (`error`) when adding the track to a served playlist throws.

### 7.4 Alerts

| Code                   | Checked by | Condition                                                                                                                                                               |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcribe_queue_lag` | worker     | the oldest queued `transcribe` job is more than 6 hours old (revisited with the benchmark). `jobs_queue_lag` excludes the class, as `video`.                            |
| `whisper_unavailable`  | worker     | the service's health check has failed for 10 minutes while `transcribe` jobs are queued.                                                                                |
| `captions_volume`      | worker     | more than `CAPTIONS_DAILY_MINUTES_ALERT` (default 120) minutes of audio captioned in the last 24 hours. Time to plan the dedicated node (D5).                           |
| `whisper_throttled`    | worker     | over the last 6 hours, at least 3 captions jobs finished and their median `cpu_steal_pct` is above 10%. The node is out of CPU credits.                                 |
| `whisper_restarts`     | worker     | 3 or more `whisper.restarted` with `during_job` in the last 24 hours: evictions or out-of-memory kills. A deploy can also restart it mid-job, so one or two don't page. |
| `jobs_no_worker`       | API        | as today, now also for `transcribe`.                                                                                                                                    |

The three capacity alerts aren't urgent, so they page at most once a day: `pageAlert` takes a cooldown per code, 24 hours for these and the current 30 minutes for the rest. The checks read Postgres, not the analytics backend: caption minutes from `processing_usage`, and `speed` and `cpu_steal_pct` from the captions derivative, where the job stores them alongside the outputs. The worker counts restarts in memory, so a worker restart resets the count; that only delays the alert.

### 7.5 Allowlist and failure reasons

- New properties: `copied`, `audio_codec`, `source`, `language`, `provider`, `model`, `chunks`, `chunk`, `chunks_done`, `chunk_duration_s`, `cues`, `segments`, `resumed`, `generate_captions`, `after`, `status_code`, `attempt`, `instance_id`, `previous_instance_id`, `during_job`, `uptime_s`, `cpu_steal_pct`, `model_loads`, `load_ms`, `jobs`, `failed`, `audio_minutes`, `median_speed`, `p95_queue_wait_s`, `max_cpu_steal_pct`, `whisper_restarts`.
- New `failed_reason` values: `no_audio_stream`, `transcription_unavailable`.
- `jobs show` shows `chunks_done` and `speed` for captions jobs. `jobs minutes <userId>` lists captions rows with their kind.

## 8. Deployment and testing

- **Images:** the API image is unchanged (it has ffmpeg). New image `codelit/medialit-whisper`, built and pushed by CI from `apps/whisper/Dockerfile` with the runtime and the model pinned, released with the same tags as the API.
- **Infra** (QA first; prod by an operator at release):
    - `medialit-whisper` deployment, one replica, `ClusterIP` service, a network policy admitting only the worker, a readiness probe on its health route, on the existing nodes (D5): requests of 0.25 CPU and 512 MiB, limits of 2 CPU and 2.5 GiB (1.9 GB measured while transcribing), and a priority class below the apps. A dedicated node comes later, when the D5 signals call for it.
    - Worker: `WHISPER_URL`, `WORKER_CONCURRENCY_TRANSCRIBE=1`. API: `WHISPER_URL` (for `captionsAvailable`).
- **`docker-compose.yml`** (self-hosting) gains the whisper service. **`docker-compose.local.yml`** gains it too, behind a compose profile (`--profile captions`), so local development doesn't pull a multi-GB image by default.
- **`.env.example`:** `TRANSCRIPTION_PROVIDER`, `WHISPER_URL`, `WORKER_CONCURRENCY_TRANSCRIBE`, `CAPTIONS_MAX_DURATION_SECONDS`, `CAPTIONS_DAILY_MINUTES_ALERT`, and `WHISPER_IDLE_UNLOAD_SECONDS` for the whisper service.
- **Docs:** the setting, the captions and transcript files and their URLs, using the VTT with `<video>`, hls.js and Video.js, captions in HLS, minutes, and self-hosting the Whisper service (CPU, memory, and what happens without it).
- **Tests:**
    - Unit tests: chunk cutting at silences (no silence, silence at the edges, a file shorter than one chunk), segment offsets across chunks, VTT cue building (line length, duration, timestamps over an hour), transcript paragraphs, dropping empty and repeated segments, the master playlist rewrite (idempotent, keeps every rendition line), the subtitle playlist, waiting derivatives (released on ready, failed on failure, ignored by the reconciler while waiting), and the settle rule for `audio` and `captions`.
    - A **fake transcription provider** for integration tests (deterministic segments from the chunk's length), so the stack suites don't need the Whisper image. One suite runs against the real service, in CI with the `tiny` model.
    - Integration tests with generated media (ffmpeg `sine` with gaps for silences, and `testsrc`):
        - `generateCaptions` on queues audio then captions for a video, captions only for an audio upload, and nothing for a video with no audio;
        - an AAC source is copied, an Opus source is encoded, and the audio is gone from storage and from the response once captions settle, whether they are ready or failed;
        - a video with no audio stream (metadata unknown at seal) fails `audio` and `captions` with `no_audio_stream` while the media stays `ready`;
        - the outputs exist, the response has `url`, `language` and `files`, and private URLs are signed;
        - a job interrupted after two chunks resumes at the third, sends the first two to the provider only once, and charges minutes once;
        - out of minutes fails `captions` and sends `media.captions.ready` with the failed derivative; the media stays `ready`;
        - the media settles and sends `media.processing.ready` while captions are still queued, and `media.captions.ready` follows; captions finishing before HLS sends the two in the other order; an audio upload with captions on settles at seal; an endpoint not subscribed to `media.captions.ready` gets nothing;
        - `MediaLitVideo` with a caller's `ref`: the ref gets the `<video>` element, and hls.js still attaches;
        - the provider failing every time fails `captions` after its attempts, leaves the media `ready`, and raises a `critical` exception; `no_audio_stream` raises none;
        - without `WHISPER_URL`, captions fail with `transcription_unavailable`, and settings report `captionsAvailable: false`;
        - HLS with captions, both orders of finishing, private and public: the master lists the track, the subtitle playlist and VTT load, and a rewrite run twice gives the same playlist;
        - deleting media during a transcription aborts the request and leaves nothing in either bucket, including progress files;
        - events and logs carry only allowlisted properties and never transcript text (checked with a capture client).
    - The AGENTS.md end-to-end checks (REST form-data and tus, browser, CLI) with captions on, against the real Whisper service: a short spoken video and an audio file get captions in the right language, the captions show in `MediaLitVideo` for HLS (hls.js in Chrome, native in Safari) and for the MP4, for public and private media.

## 9. Rollout

- `generateCaptions` is off for every app, so nothing changes until an app turns it on.
- **Deploy order:** the Whisper service, then the worker, then the API.
- **Rollback:** an old worker leaves `media.audio`, `media.captions` and `media.hls_subtitles` jobs queued, and waiting `captions` rows without jobs. After rolling back, cancel them with `jobs cancel --type <type> --yes`; the old reconciler then fails their derivatives. The old reconciler doesn't know about waiting rows, so it also fails `captions` rows waiting for an audio job. That is the result we want after a rollback.

## 10. Order of work

0. **Benchmark** (D5): done on 2026-11-27. Before release, check captions by hand on a few real course videos. Thread scaling is measured when a dedicated node is added (D5).
1. **Setting and waiting derivatives:** `generateCaptions` in REST, MCP, the SDK, the CLI and the dashboard; `after` in the plan, `finishDerivative` and the reconciler (D2); background derivatives and `media.captions.ready` (D10). Nothing queues jobs yet.
2. **#266 audio extraction** (D3), on the shared video job code.
3. **The Whisper service and provider** (D4): the image, CI, compose files, infra manifests, the provider interface, the fake provider.
4. **#269 captions job** (D7, D8, D9): chunking, resume, outputs, minutes, the response fields, `<track>` in `MediaLitVideo`.
5. **Captions in HLS** (D11): the served playlist for private media, `media.hls_subtitles` for public media.

Each step ships its events, logs, exceptions and alerts from section 7.

## 11. Out of scope

- Uploading or editing captions, and captions in more than one language (translation).
- Speaker labels (#269: known limit).
- A language setting (D1).
- Captions for media sealed before the setting was turned on (#247: reprocessing comes later).
- Burned-in captions.
- Summaries and tags (#270, closed).
- A GPU node, unless the benchmark or the queue says so.
- Autoscaling the Whisper service (D6).

## 12. Decisions made in review

1. **Whisper only** (D5). Rumble-2-Flash is left for a later iteration. The benchmark chose faster-whisper with `large-v3-turbo` int8 and VAD over whisper.cpp.
2. **The extracted audio is deleted once captions settle** (D3). It isn't a user-facing derivative, so #266's "store it as a derivative" holds only for the life of the captions job.
3. **A caption minute costs one processing minute** (D9), set from the benchmark: transcription uses about as much CPU per minute as the HLS ladder, or less, for most languages.
4. **The CDN may serve a public master playlist without the subtitle track for up to an hour** (D11). Accepted for now.
5. **Caption and audio failures leave the media `ready`** (D10), after the job's retries (D7).
6. **No new node for the first version** (D5). There is no caption traffic yet, so Whisper shares the existing nodes, unloads its model when idle, and is evicted before the apps. A dedicated node is added when the queue, caption minutes, CPU credits or evictions call for it.
7. **Captions don't hold up the media** (D10). They are background derivatives with their own webhook, `media.captions.ready`, and apps get a stable `transcript.json` contract and a `ref` on `MediaLitVideo` (D8), enough for synced transcripts without MediaLit knowing about them.
