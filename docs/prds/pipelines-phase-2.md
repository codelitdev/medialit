# Pipelines phase 2: transcription and captions

**Issue:** #259 (part of #247). Sub-issues: #266 (audio extraction), #269 (transcription and captions).

**Status:** Decisions made in review (section 12). The benchmark (D4) chose faster-whisper with `large-v3-turbo` int8 and set the price of a caption minute. Kept lean on purpose: CourseLit is the only consumer so far, so anything it doesn't need yet is in section 11.

## 1. Goal

Transcribe the audio of videos and audio files, and turn it into captions (WebVTT) and a transcript. Transcription runs on Whisper inside MediaLit's own workers, with no hosted AI provider and no API key, so self-hosted installs and the cloud work the same, and audio never leaves the cluster.

One media setting controls it: `generateCaptions` (`boolean`, default `false`), which a seal request can override for one upload (D9). Audio extraction (#266) is a step inside the captions job, not a derivative of its own.

## 2. What exists after phase 1

- **Seal plans the jobs** (`apps/api/src/media/processing-plan.ts`) and queues them in its commit transaction (`afterSealCommit`), each with a `queued` derivative row and its settings copied into `params`.
- **Derivative jobs** use `derivativeJob()`. `finishDerivative` records the result under the media row lock, queues `media.publish` for public media, and settles the media when no derivative is `queued` or `processing`.
- **The reconciler** (`media.processing_reconcile`, every 5 minutes) fails a derivative that has been `queued` or `processing` for 10 minutes with no queued or running job for it.
- **Settling (D12 of phase 1):** a failed poster, or HLS or MP4 refused by a limit (`out_of_processing_minutes`, `source_too_large`, `source_too_long`), leaves the media `ready`. Any other failed derivative settles it `failed`.
- **Job classes:** `cpu` (default: the number of cores), `io` (16) and `video` (1). `WORKER_CLASSES` chooses which a worker serves, and `jobs_no_worker` pages when a class has no live worker. The worker in QA and prod has 2 CPU, 2 GiB and 12 GiB of temp disk.
- **The shared video job code** (`video-job.ts`) checks the source size, downloads the original to a work directory, probes it, reserves minutes, runs ffmpeg locally under `prlimit` with a timeout, kills it on abort, uploads, and removes the work directory. It separates permanent failures from retried ones.
- **Processing minutes** (`processing_usage`): reserved when an encode starts, keyed by job ID, released when it fails for good. 5 a month free, 300 paid, unlimited self-hosted. Rows have a `kind` (`hls`, `mp4`).
- **Bucket CORS** (`GET`, `HEAD` from any origin) is on both buckets and the CDN, which `<track>` elements also need.
- **`@medialit/react`** has `MediaLitVideo`, which plays HLS (hls.js, or natively on Safari), then MP4, then the original.

## 3. Decisions

### D1. One media setting, per app

| Setting            | Values    | Default |
| ------------------ | --------- | ------- |
| `generateCaptions` | `boolean` | `false` |

- Every app starts `false`, existing and new, as `videoStreaming` does (phase 1, decision 9). An admin turns it on for the apps that need it. Null means `false`, so no backfill is needed.
- It applies to video and audio uploads sealed afterwards. Seal copies it into the job's params, so changing it affects new uploads only. A seal request can override it for one upload (D9).
- It is independent of `videoStreaming`. Captions attach to HLS, the MP4 and the original alike, through `<track>` (D6).
- **Language is detected**, not set. A `captionsLanguage` setting can come later if detection isn't good enough (#269).
- The free plan can turn it on. It then uses its free minutes (D7).
- **Availability:** `GET` settings returns `captionsAvailable`, true when a worker serving the `transcribe` class (D3) has been seen in the last 5 minutes, the same check as `jobs_no_worker`. A self-hosted install without the transcription worker gets `false`, and the dashboard says so next to the switch. Captions jobs queued meanwhile wait for a worker; they don't fail.

### D2. What a captions job does

Job `media.captions`, class `transcribe` (D5), derivative `captions`. One job does everything, including the audio extraction #266 asked for:

1. **Downloads the original** to a work directory, video or audio, with the video jobs' size check first (`VIDEO_MAX_SOURCE_BYTES`, phase 1 D4).
2. **Probes it** and refuses sources over `CAPTIONS_MAX_DURATION_SECONDS` (default 7200, as for video) with `source_too_long`, or with no audio stream with `no_audio_stream`.
3. **Reserves minutes** for the whole duration (D7).
4. **Extracts the audio** straight to 16 kHz mono 16-bit PCM WAV with ffmpeg (`-map 0:a:0 -vn -ac 1 -ar 16000`), under the same `runLimited` and allowlist as the encodes. About 115 MB per hour of audio; seconds of work next to minutes of transcription.
5. **Transcribes the whole file** in one run of the transcriber (D3).
6. **Writes the outputs** (D6) under `captions/`, uploads them, and finishes the derivative.

- **Voice activity detection** runs in the transcriber (faster-whisper's `vad_filter`, Silero), so Whisper never sees long silence or music, where it invents text (D4). The job also drops any segment whose text is empty, or which repeats the previous segment's text more than twice in a row, a known Whisper failure.
- **No chunking and no resume** in this version. faster-whisper's VAD already splits long audio internally. If the worker is interrupted (a spot interruption, an eviction, a deploy), the next attempt starts over. Minutes reserved by the first attempt are kept, because the reservation is per job (phase 1, D8). Chunking with saved progress comes back if interruptions start wasting real work (section 11).
- **Timeout:** `max(15 min, 3 × duration)`, enforced by the job as the video jobs do, with the job type's `timeoutMs` set to the largest possible value. 3× covers Hindi's 2.4× real time (D4) with room for a busy node.
- **Retries:** 3 attempts, as encodes (section 12, decision 5), with the queue's usual backoff.
    - **Permanent:** limits (`source_too_long`, `source_too_large`, `no_audio_stream`, `out_of_processing_minutes`), ffmpeg exiting with an error on our local file (`bad_input`), and the job's timeout.
    - **Retried:** the transcriber crashing or being killed for memory, the worker shutting down, storage and database errors.

Alternatives rejected: **a separate `audio` derivative and a captions job that waits for it.** Extraction takes seconds, so it gains nothing for the waiting-derivative mechanism, reconciler rules and cleanup it needs. The audio isn't kept, so #266's "store it as a derivative" no longer applies (section 12, decision 2).

### D3. The transcriber runs inside a transcription worker

- **A command, run like ffmpeg.** `apps/transcribe/transcribe.py` (Python, about fifty lines) takes a WAV path, an output path and a thread count, runs faster-whisper, and writes `{ language, segments: [{ start, end, text }], loadMs }` as JSON. The job runs it as a child process with the job's timeout, and kills it when the job's signal aborts (cancel, delete, timeout, shutdown), as the video jobs do with ffmpeg. **No `prlimit --as`:** CTranslate2, OpenMP and onnxruntime (Silero VAD) reserve far more address space than they use, so an address-space limit would fail healthy runs. The pod's memory limit (3 GiB, cgroup) is the guard instead: the pod runs nothing else, the kernel kills the transcriber (the largest process) when it is exceeded, and the job is retried.
- **Its own worker image.** `codelit/medialit-transcribe` is the API image plus Python, faster-whisper and the model, built and pushed by CI with the same release tags, so the worker code and the API always match. The model is baked in, so pods download nothing at start. The API image stays as it is.
- **Its own deployment.** `medialit-transcribe` runs the ordinary MediaLit worker with `WORKER_CLASSES=transcribe`. The existing worker doesn't serve that class. No HTTP service, network policy, health route or URL: the queue is the interface.
- **Memory is freed after every job.** The model loads when the transcriber starts (10 to 16 seconds on the QA node, D4) and goes away when it exits, so an idle transcription pod holds only the worker process.
- **Self-hosting:** one more container in `docker-compose.yml`, the same worker command with a different image and `WORKER_CLASSES`, behind a `captions` profile so installs that don't want captions never pull the 3 GB image. Without it, captions aren't available (D1).
- The provider stays a small interface in `apps/api/src/transcription/`, so tests use a fake one (section 8) and another engine can be added later without changing the job.

    ```ts
    type TranscribeResult = {
        language: string;
        segments: { start: number; end: number; text: string }[]; // seconds from the start of the file
        loadMs: number;
    };
    interface Transcriber {
        model: string; // "faster-whisper/large-v3-turbo-int8"
        transcribe(input: {
            wavPath: string;
            signal: AbortSignal;
        }): Promise<TranscribeResult>;
    }
    ```

### D4. Runtime and model: faster-whisper, `large-v3-turbo` int8

The first task of #269. Compared on the QA node, with English, Spanish and Hindi speech and a stretch of music and silence.

| Runtime                      | Notes                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| whisper.cpp                  | C++, no Python, small image. Silero VAD built in (`--vad`). Quantized models (`q5_0`, `q8_0`).           |
| faster-whisper (CTranslate2) | Python, int8 on CPU, Silero VAD built in (`vad_filter`). Needs a small script of our own around it (D3). |

**Whisper only in this phase** (section 12, decision 1). Rumble-2-Flash (Reson8, open weights) was considered and left for a later iteration: it returns no timestamps, has no VAD and has no maintained CPU server.

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

**Decision: faster-whisper with `large-v3-turbo` int8 and its Silero VAD.** It is more accurate, about 1.8× faster, and drops less speech. What it costs: Python and the script in the transcription image (D3), with its dependencies pinned. faster-whisper 1.2.1 can't read files with PyAV 17 (`av.open` lost `metadata_errors`), so the script decodes the WAV itself with soundfile and passes samples; the image pins PyAV anyway. A 2-hour file is about 460 MB of samples in memory, on top of the 1.9 GB measured, which the 3 GiB limit covers.

**Sizing.** On 2 Graviton2 cores, faster-whisper runs at about 0.9× real time for English: one transcription pod keeps up with about 25 hours of uploaded audio a day, less for languages such as Hindi. There is no caption traffic yet, so **the first version runs on the existing nodes**, in QA and prod:

- an idle transcription pod holds only the worker process, because the model lives only as long as a job (D3);
- the pod requests little (0.25 CPU, 512 MiB) and is limited to 2 CPU and 3 GiB, with a priority class below the apps. Under memory pressure the kubelet evicts it before any app, and the job is retried (D2);
- a few videos a day stay well inside a t4g's CPU credits. Hours of steady transcription would not.

**A dedicated node** (non-burstable, for example a c7g.large, with the pod pinned to it) is added when captions wait too long (`transcribe_queue_lag`) or pass about 2 hours of audio a day (`captions_volume`), section 7. It is a change to the deployment's node selector and requests, not to the code. Scaling past 2 threads is measured then.

### D5. A `transcribe` job class

- One transcription can take about as long as the audio. It must not hold up image and video jobs, and they must not hold it up.
- New class `transcribe`, default concurrency 1, set with `WORKER_CONCURRENCY_TRANSCRIBE`. Each transcription pod runs one job at a time with both its cores; more capacity means more pods.
- Captions jobs use the same priority as video jobs (paid and self-hosted first, phase 1 D11).
- Autoscaling on queue length is out of scope (section 11).

### D6. Outputs, and how players and apps use them

Under the media's folder, as one derivative with key `captions/`:

| File                       | Contents                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captions/captions.vtt`    | WebVTT. Cues of at most 2 lines of 42 characters and 7 seconds, split at segment and word boundaries.                                                                       |
| `captions/transcript.txt`  | Plain text, one paragraph per pause of 2 s or more.                                                                                                                         |
| `captions/transcript.json` | `{ version: 1, language, durationSeconds, model, segments: [{ id, start, end, text }] }`. Times in seconds with millisecond precision; `id` is the segment's index, from 0. |

- **The media response:** `derivatives.captions` gets `url` (the VTT), `language` (ISO 639-1), and `files: { vtt, text, json }` with a URL for each. `MediaDerivative` gains the two optional fields. URLs are signed for private media, as for any derivative.
- **The size** is the sum of the three files. **Public media:** published like other derivatives.
- **`MediaLitVideo`** adds `<track kind="captions" srclang={language} label={language name} src={derivatives.captions.url} crossorigin>` whatever it plays: HLS through hls.js (which plays through the same `<video>` element, so its tracks still show), native HLS on Safari, the MP4 or the original. The HLS playlist isn't changed (section 11). Safari's fullscreen player on iPhone is checked before release (section 8). An audio player isn't part of this phase.
- **What apps build on it**, such as a transcript beside the video that highlights the line being spoken and seeks when a line is clicked, search within a lesson, or an app's own corrected copy:
    - `transcript.json` is the contract for apps. Its segments are in order, don't overlap, and their times are from the start of the media. `id` is stable for that file, so an app can anchor notes or corrections to a segment. `version` changes only on a breaking change; new fields (word-level times, later) are added without one.
    - The VTT's cues come from the same segments, split for display, so the transcript and the captions never disagree on what was said or when.
    - **`MediaLitVideo` forwards a `ref` to its `<video>` element**, merged with the ref it uses internally, so an app can read `currentTime` and seek. Today a `ref` passed in would land in the spread props after the internal one and break hls.js.
    - Apps learn that captions are ready from the `media.captions.ready` webhook (D8) or by reading the media.
- **Captions are never edited by MediaLit.** An app that wants to fix them stores its own copy.

### D7. Processing minutes for captions

- **What counts:** the audio's duration, rounded up to whole minutes, once per captions job, with `kind = 'captions'` in `processing_usage`. Minutes of silence removed by VAD still count: the user can predict the charge from the file's length.
- **The same monthly allowance** as video encodes (#247: processing is one meter). **One minute of audio costs one processing minute** (section 12, decision 3). On the QA node, transcription took 96 CPU seconds per minute of English audio (84 for Spanish, 245 for Hindi), and phase 1's three-rendition HLS ladder took 151 CPU seconds per minute of a synthetic 1080p source, which encodes more easily than real footage. Captions therefore cost about the same as encoding, or less, for most languages, and an MP4 re-encode is already charged one for one.
- Reserved when the job starts, after the probe, kept across retries, released if the job fails for good, as phase 1 D8 does, including by the reconciler.
- **Out of minutes:** `captions` fails with `out_of_processing_minutes`, the media stays `ready` (D8), and `processing_minutes.exhausted` is sent once per account a month, as today.

### D8. Captions don't hold up the media, and have their own webhook

Captions add to a file that already plays, and can take much longer than the encodes: one transcription pod works through them one at a time, so a queue there could delay a video's `ready` by hours if the media waited for them.

- **`captions` is a background derivative.** The media settles when every other derivative has settled, as phase 1 does, without waiting for it. `media.processing.ready` (or `failed`) fires then, and its payload shows `captions` as `queued` or `processing`.
- **It never changes the media's status.** Whatever its error, the original, poster, HLS and MP4 are still there, so a failed `captions` never makes the media `failed`, and its settling doesn't touch `processing_status`. Nor does it touch `processing_error`: a captions failure is reported only in `derivatives.captions.error` and `media.captions.ready`, so `processing.error` keeps describing playback.
- **An audio upload with captions on settles at seal**, as it does today with nothing to process. Clients see no change in how audio uploads settle.
- **New webhook `media.captions.ready`**, queued in the transaction that settles `captions`, ready or failed for good (including by the reconciler). Its payload has the same shape as the processing webhooks: `mediaId`, `appId`, the media's `status`, and `derivatives.captions` with its `status`, and its `error` when it failed. The client reads the media for the URLs. Endpoints receive it only when they subscribe to it (`WEBHOOK_EVENTS` gains it, but an endpoint created without `events` still gets only the two processing events), so existing and new endpoints see nothing new unless they ask.
- **The two webhooks can arrive in either order.** Captions for a short video can finish before its HLS encode.

Alternatives rejected: letting captions hold the media in `processing` (the delay above), and settling `failed` when captions fail (it would tell clients a lesson video is unusable because its captions failed).

### D9. Processing settings can be overridden per upload, at seal

The media settings are per app, and every video sealed in the app gets the same processing. CourseLit lets trial schools upload large videos, and with HLS and captions on for its app, every trial upload would be encoded and transcribed, spending CourseLit's minutes and holding up paying schools in the same queue.

- **`POST /media/seal/{mediaId}` takes an optional `processing` object:**

    ```json
    { "processing": { "videoStreaming": "off", "generateCaptions": false } }
    ```

    `videoStreaming` (`"off"`, `"hls"` or `"mp4"`, phase 1) and `generateCaptions` are each optional. A field that is left out uses the app's setting. `hlsRenditions` always comes from the app.

- **Seal is the right place.** Processing is decided at seal (phase 0: compute is spent only on files that are kept), and seal is called by the app's own server with its API key (or the dashboard, the CLI and MCP for their users). A browser holding an upload signature can't seal, so a trial user can't turn processing back on. Signatures don't change.
- **Either direction.** The override can turn processing off for an app that has it on, or on for an app that has it off. The caller holds the account's API key and pays the minutes.
- **Stored with the jobs**, as the app settings are: seal copies the values in effect into each job's params.
- **Sealing again changes nothing.** A second seal of sealed media returns it unchanged and ignores its `processing`. There is no reprocessing (section 11), so an upload sealed with processing off stays that way after the school upgrades.
- **Exposed in** REST (in the OpenAPI spec), MCP (`seal_media` gains `processing`), the SDK, and the CLI (`medialit upload` and `medialit seal` gain `--video-streaming <off|hls|mp4>`, the same flag as `settings set`, and `--captions <on|off>`). Invalid values are a `400`, and the media stays temp.
- `media.sealed` (phase 0) gains `processing_overridden` (boolean), `video_streaming` and `generate_captions`, the values in effect.

Alternatives rejected: **a separate MediaLit app for trial schools** (media would have to move between apps when a school upgrades), and **the override in the upload signature** (signatures are made before the app knows whether the file will be kept).

### D10. Which jobs seal queues

Phase 1's D11, extended. "Captions on" and `videoStreaming` are the values in effect for the upload: the app's settings, or the seal's override (D9). "Audio known absent" means seal's metadata read the file and found no audio stream.

| Media                                            | Jobs                                 |
| ------------------------------------------------ | ------------------------------------ |
| Video, captions off                              | as phase 1 (poster, plus HLS or MP4) |
| Video, captions on                               | as phase 1, plus captions            |
| Video, captions on, audio known absent           | as phase 1                           |
| Audio (`audio/*`, or a video type with no video) | captions, when on                    |
| Image, anything else                             | none                                 |

Seal sets `processing_status = 'processing'` only for derivatives other than `captions` (D8).

## 4. Data model

```sql
media_settings
  + generate_captions  boolean          -- null = false (D1)

derivatives
  -- no change: captions' language, speed and cpu_steal_pct go in params

processing_usage
  -- no change: kind gains 'captions'
```

No migration of existing rows.

## 5. Flows

**Seal:** as in phase 1, with the jobs from D10 and the seal's override where given (D9).

**Captions:** start the derivative, check the size, download, probe, reserve minutes, extract the audio to WAV, run the transcriber, write the outputs, finish and send `media.captions.ready`. On a permanent failure, release the minutes.

**Playback:** the VTT through `<track>` in `MediaLitVideo`, for HLS, the MP4 and the original (D6).

**Delete:** unchanged. The prefix delete removes `captions/`. A running transcription is aborted on its next heartbeat and its transcriber process killed. Usage rows stay.

## 6. API surface

These changes only add fields.

- **Media settings** (REST, MCP, SDK): `generateCaptions`; `GET` adds `captionsAvailable` (D1).
- **Media response** (REST, MCP, CLI, `@medialit/models`): `derivatives.captions` with `url`, `language` and `files` (D6).
- **Seal** (REST, MCP, SDK, CLI): optional `processing: { videoStreaming?, generateCaptions? }` (D9).
- **CLI:** `medialit settings set --captions <on|off>`; `medialit upload` and `medialit seal` take `--video-streaming` and `--captions`. `medialit get <mediaId>` shows the captions' language and URL.
- **Dashboard:** a Captions switch in the Media tab, with the minutes it uses and a note when `captionsAvailable` is false. File details show the captions' status and language, link the VTT and transcript, and the preview shows the captions.
- **Webhooks:** new event `media.captions.ready` (D8), subscribed to per endpoint in REST, MCP and the dashboard. `media.processing.ready` no longer waits for captions.
- **`@medialit/react`:** `MediaLitVideo` adds the captions `<track>` and forwards a `ref` (D6).
- The OpenAPI spec is regenerated.

## 7. Observability and operations

Through `@codelitdev/observability`, as phase 1 (section 7 there). Events carry only IDs, enums, counts, sizes and durations. **Never sent or logged: transcript text, captions, or anything derived from them other than the language code and counts.**

### 7.1 Events

| Event             | When                          | Properties                                                                                                                                                                |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captions.made`   | a captions job succeeds       | `media_id`, `source` (`audio_upload` \| `video`), `language`, `model`, `source_duration_s`, `cues`, `duration_ms`, `load_ms`, `speed`, `cpu_steal_pct`, `minutes_charged` |
| `captions.failed` | a captions job fails for good | `media_id`, `failed_reason`, `source_duration_s`, `attempt`                                                                                                               |

- `speed` is audio seconds per second of transcription. `cpu_steal_pct` is the node's CPU steal while the transcriber ran, read by the job from `/proc/stat` (node-wide): a burstable instance out of CPU credits shows up as steal, and as `speed` falling. Together they show when the shared node is too small (D4).
- `media_settings.updated` gains `generate_captions`. `media.sealed` gains the D9 properties.

### 7.2 Logs

| Message              | Level | Extra fields                                                               |
| -------------------- | ----- | -------------------------------------------------------------------------- |
| `captions made`      | info  | `language`, `cues`, `source_duration_s`, `duration_ms`, `load_ms`, `speed` |
| `transcriber failed` | warn  | `exit_code` or `signal`, `attempt`                                         |

### 7.3 Exceptions

- **No exception** for `no_audio_stream`, `source_too_long`, `source_too_large`, `out_of_processing_minutes` and `bad_input`. They are the tenant's input, and are shown on the media.
- `critical` for a captions job that fails for good because the transcriber kept failing, and for `db`, `storage` and `internal`, as today.

### 7.4 Alerts

| Code                   | Checked by | Condition                                                                                                                                                                                                                               |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcribe_queue_lag` | worker     | the oldest queued `transcribe` job is more than 6 hours old. `jobs_queue_lag` excludes the class, as `video`.                                                                                                                           |
| `captions_volume`      | worker     | more than `CAPTIONS_DAILY_MINUTES_ALERT` (default 120) minutes of audio captioned in the last 24 hours, from `processing_usage`. Time to plan the dedicated node (D4). Pages at most once a day: `pageAlert` gains a cooldown per code. |
| `jobs_no_worker`       | API        | as today, but for `transcribe` only while `transcribe` jobs are queued, so installs without the transcription worker aren't paged.                                                                                                      |

### 7.5 Allowlist and failure reasons

- New properties: `source`, `language`, `model`, `cues`, `load_ms`, `speed`, `cpu_steal_pct`, `generate_captions`, `video_streaming`, `processing_overridden`, `exit_code`, `signal`, `attempt`.
- New `failed_reason`: `no_audio_stream`.
- `jobs minutes <userId>` lists captions rows with their kind.

## 8. Deployment and testing

- **Images:** the API image is unchanged. New image `codelit/medialit-transcribe` (D3), built by CI from `apps/transcribe/Dockerfile` on top of the API image, with Python, faster-whisper, PyAV and the model pinned, released with the same tags.
- **Infra** (QA first; prod by an operator at release): a `medialit-transcribe` deployment, one replica, running the worker with `WORKER_CLASSES=transcribe` and `WORKER_CONCURRENCY_TRANSCRIBE=1`, the worker's usual environment, on the existing nodes (D4): requests of 0.25 CPU and 512 MiB, limits of 2 CPU and 3 GiB, and a priority class below the apps. The existing worker keeps its classes, without `transcribe`.
- **`docker-compose.yml`** (self-hosting) and **`docker-compose.local.yml`** gain the transcription worker behind a compose profile (`--profile captions`), so nobody pulls a multi-GB image by default.
- **`.env.example`:** `WORKER_CONCURRENCY_TRANSCRIBE`, `CAPTIONS_MAX_DURATION_SECONDS`, `CAPTIONS_DAILY_MINUTES_ALERT`.
- **Docs:** the setting and the seal override, the captions and transcript files and their URLs, using the VTT with `<video>`, hls.js and Video.js, minutes, and self-hosting the transcription worker (CPU, memory, and what happens without it).
- **Tests:**
    - Unit tests: VTT cue building (line length, duration, timestamps over an hour), transcript paragraphs, `transcript.json`, dropping empty and repeated segments, the settle rule for `captions`, and the seal plan with and without an override.
    - A **fake transcriber** for integration tests (deterministic segments from the file's length), so the stack suites don't need the transcription image. A CI job (`check-transcriber.sh`) builds the image with the `tiny` model and transcribes synthesized English speech with the real script.
    - Integration tests with generated media (ffmpeg `sine` with gaps, and `testsrc`):
        - `generateCaptions` on queues captions for a video and an audio upload, and nothing for a video with no audio;
        - a seal with `processing: { videoStreaming: "off", generateCaptions: false }` in an app with both on queues only the poster; the reverse queues HLS and captions; a field left out uses the app's setting; an invalid value is a `400` and the media stays temp; sealing again changes nothing;
        - a video with no audio stream (metadata unknown at seal) fails `captions` with `no_audio_stream` while the media stays `ready`;
        - the outputs exist, the response has `url`, `language` and `files`, and private URLs are signed;
        - the media settles and sends `media.processing.ready` while captions are queued, and `media.captions.ready` follows; captions finishing first sends them in the other order; an audio upload with captions on settles at seal; an unsubscribed endpoint gets nothing;
        - out of minutes fails `captions`, sends `media.captions.ready` with the failure, and the media stays `ready`;
        - the transcriber crashing every time fails `captions` after 3 attempts, charges nothing, and raises a `critical` exception;
        - with no `transcribe` worker, settings report `captionsAvailable: false`, jobs stay queued, and `jobs_no_worker` pages only while they are;
        - deleting media during a transcription kills the transcriber and leaves nothing in either bucket;
        - `MediaLitVideo` with a caller's `ref`: the ref gets the `<video>` element, and hls.js still attaches;
        - events and logs carry only allowlisted properties and never transcript text (checked with a capture client).
    - The AGENTS.md end-to-end checks (REST form-data and tus, browser, CLI) with captions on, against the real transcription worker: a short spoken video and an audio file get captions in the right language, and the captions show in `MediaLitVideo` with HLS (hls.js in Chrome, native in Safari, including fullscreen on an iPhone) and with the MP4, for public and private media.

## 9. Rollout

- `generateCaptions` is off for every app, so nothing changes until an app turns it on.
- **Deploy order:** the API and worker, then the transcription worker.
- **Rollback:** after rolling back, cancel queued captions jobs with `jobs cancel --type media.captions --yes`; the old reconciler then fails their derivatives, and the old settle rule may then settle the media `failed`. Captions are off by default, so this only affects apps that turned them on.

## 10. Order of work

0. **Benchmark** (D4): done on 2026-11-27. Before release, check captions by hand on a few real course videos.
    - **Before step 3:** run one 1–2 hour file through the script on the QA node, to confirm memory stays under 3 GiB and speed holds for whole-file transcription (the benchmark's longest input was 18 minutes), and check that the transcription image (with the model, about 3 GB) fits the nodes' free disk.
    - **Before step 4:** check that a sidecar `<track>` shows with native HLS on an iPhone, inline and fullscreen. If it doesn't, the HLS subtitle track comes back into scope (section 11) for Safari.
1. **Per-upload override at seal** (D9), in REST, MCP, the SDK and the CLI. It ships first, on its own: it also covers phase 1's `videoStreaming`, which CourseLit can use for trial schools now.
2. **Setting, background derivative and webhook:** `generateCaptions` in REST, MCP, the SDK, the CLI and the dashboard, `captionsAvailable`, the `transcribe` class, the settle rule and `media.captions.ready` (D1, D5, D8).
3. **Transcription worker** (D3): the script, the image, CI, compose files and infra manifests, the transcriber interface and the fake.
4. **Captions job** (D2, D6, D7): extraction, transcription, outputs, minutes, the response fields, and the `<track>` and `ref` in `MediaLitVideo`.

Each step ships its events, logs, exceptions and alerts from section 7.

## 11. Out of scope

Left out to keep the first version lean; each can be added without changing what apps already use.

- **Captions inside the HLS playlist** (an `EXT-X-MEDIA` subtitle track). Needed only by players that read just the playlist, such as some TV apps and Chromecast.
- **Chunking with saved progress**, so an interrupted job resumes instead of starting over. Added if interruptions waste real work.
- **The extracted audio as a derivative** apps can download (#266's original ask).
- **A provider choice per app**, and external providers (such as ElevenLabs) with the tenant's own API key, not charged as processing minutes. The transcriber interface (D3) leaves room for them.
- Rumble-2-Flash (D4).
- Uploading or editing captions, captions in more than one language (translation), and word-level times.
- Speaker labels (#269: known limit), and a language setting (D1).
- Captions for media sealed before the setting was turned on (#247: reprocessing comes later).
- Burned-in captions, summaries and tags (#270, closed).
- A GPU node, a dedicated node before the D4 signals, and autoscaling the transcription worker.

## 12. Decisions made in review

1. **Whisper only** (D4). The benchmark chose faster-whisper with `large-v3-turbo` int8 and VAD over whisper.cpp. Rumble-2-Flash is left for a later iteration.
2. **No separate audio derivative** (D2). The captions job extracts the audio itself into its work directory, and nothing is kept.
3. **A caption minute costs one processing minute** (D7), set from the benchmark.
4. **Caption failures leave the media `ready`** (D8), after the job's retries (D2).
5. **Captions don't hold up the media** (D8). `captions` is a background derivative with its own webhook, `media.captions.ready`. Apps get a stable `transcript.json` and a `ref` on `MediaLitVideo` (D6), enough for synced transcripts without MediaLit knowing about them.
6. **Transcription runs as a job in its own worker deployment, `medialit-transcribe`** (D3), not as an HTTP service. The model loads per job, so idle pods are small.
7. **No new node for the first version** (D4). A dedicated node is added when `transcribe_queue_lag` or `captions_volume` call for it.
8. **Processing can be overridden per upload, at seal** (D9), in either direction, so CourseLit can skip processing for trial schools.
9. **Lean first version** (section 11): no HLS subtitle track (`MediaLitVideo` adds the VTT as a `<track>` for every source), no chunking or resume, and no provider choice. CourseLit is the only consumer so far.
