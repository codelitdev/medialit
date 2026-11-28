/**
 * Video settings and processing (pipelines-phase-1.md), against a live API:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:video
 *
 * Changes the app's video settings, then restores them. Use a test app with
 * no concurrent media writes.
 */
import assert from "node:assert/strict";
import {
    generateAudio,
    generatePng,
    generateVideo,
    isWebp,
    type JsonObject,
    object,
    serverOptions,
} from "./utils";

interface VideoSettings {
    videoStreaming: string;
    hlsRenditions: string[];
    generateCaptions?: boolean;
    captionsAvailable?: boolean;
}

export async function runVideoIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const { apiKey, base } = serverOptions(options);
    const log = options.log ?? console.log;
    let original: (VideoSettings & JsonObject) | undefined;
    const created: string[] = [];

    async function call(path: string, body?: JsonObject, method = "POST") {
        const response = await fetch(new URL(path, base), {
            method,
            headers: {
                "x-medialit-apikey": apiKey!,
                "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            redirect: "error",
            signal: AbortSignal.timeout(60_000),
        });
        const text = (await response.text()).split(apiKey!).join("");
        return {
            status: response.status,
            body: text ? (JSON.parse(text) as unknown) : null,
        };
    }

    async function api(path: string, body?: JsonObject) {
        const response = await call(path, body);
        assert.equal(
            response.status,
            200,
            `POST /${path}: ${JSON.stringify(response.body)}`,
        );
        return object(response.body);
    }

    /** A form-data upload; returns the upload response. */
    async function upload(
        bytes: Buffer,
        name: string,
        type: string,
        access: "public" | "private" = "private",
    ): Promise<JsonObject> {
        const form = new FormData();
        form.set("file", new Blob([Uint8Array.from(bytes)], { type }), name);
        form.set("access", access);
        const response = await fetch(new URL("media/create", base), {
            method: "POST",
            headers: { "x-medialit-apikey": apiKey! },
            body: form,
            signal: AbortSignal.timeout(120_000),
        });
        const text = (await response.text()).split(apiKey!).join("");
        assert.equal(response.status, 200, `upload ${name}: ${text}`);
        const media = object(JSON.parse(text));
        created.push(String(media.mediaId));
        return media;
    }

    const seal = async (mediaId: unknown) =>
        await api(`media/seal/${encodeURIComponent(String(mediaId))}`);

    /** Polls a media item until its processing leaves `processing`. */
    async function waitForProcessing(
        mediaId: unknown,
        timeoutMs = 120_000,
    ): Promise<JsonObject> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const media = await api(
                `media/get/${encodeURIComponent(String(mediaId))}`,
            );
            const status = object(media.processing).status;
            if (status !== "processing") return media;
            if (Date.now() > deadline) {
                throw new Error(`${String(mediaId)} still processing`);
            }
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }

    /** Polls a media item until its captions settle. */
    async function waitForCaptions(
        mediaId: unknown,
        timeoutMs = 120_000,
    ): Promise<JsonObject> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const media = await api(
                `media/get/${encodeURIComponent(String(mediaId))}`,
            );
            const captions = object(media.derivatives).captions as
                | JsonObject
                | undefined;
            if (captions?.status === "ready" || captions?.status === "failed") {
                return media;
            }
            if (Date.now() > deadline) {
                throw new Error(`${String(mediaId)} captions not settled`);
            }
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }

    /** Checks the three captions files of a media item. */
    async function checkCaptions(media: JsonObject, access: string) {
        const captions = object(object(media.derivatives).captions);
        assert.equal(captions.status, "ready", JSON.stringify(captions));
        assert.equal(captions.language, "en");
        const files = object(captions.files);
        assert.equal(captions.url, files.vtt);
        if (access === "private") {
            assert.match(String(files.vtt), /X-Amz-Signature=/);
        }
        const origin = { Origin: "https://player.example" };
        const vtt = await fetch(String(files.vtt), { headers: origin });
        assert.equal(vtt.status, 200);
        assert.match(String(vtt.headers.get("content-type")), /^text\/vtt/);
        const vttText = await vtt.text();
        assert.match(vttText, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:0/);
        const text = await (await fetch(String(files.text))).text();
        assert.match(text, /^Segment 1\./);
        const json = object(await (await fetch(String(files.json))).json());
        assert.equal(json.version, 1);
        assert.equal(json.language, "en");
        assert.equal(json.model, "fake");
        const segments = json.segments as JsonObject[];
        assert.ok(segments.length >= 1);
        assert.deepEqual(Object.keys(segments[0]), [
            "id",
            "start",
            "end",
            "text",
        ]);
        assert.equal(segments[0].id, 0);
    }

    /** Fetches a master playlist, its renditions, their init files and
     * first segments, the way a player in a browser on another site would. */
    async function checkHls(masterUrl: string, access: "private" | "public") {
        const origin = { Origin: "https://player.example" };
        const masterResponse = await fetch(masterUrl, { headers: origin });
        assert.equal(masterResponse.status, 200, `GET ${masterUrl}`);
        if (access === "private") {
            assert.match(
                masterUrl,
                /\/media\/[^/]+\/hls\/[^/]+\/master\.m3u8$/,
            );
            assert.equal(
                masterResponse.headers.get("content-type"),
                "application/vnd.apple.mpegurl",
            );
            assert.equal(
                masterResponse.headers.get("access-control-allow-origin"),
                "*",
            );
        }
        const master = await masterResponse.text();
        const resolutions = [...master.matchAll(/RESOLUTION=(\d+x\d+)/g)].map(
            (m) => m[1],
        );
        // A 720p source: 1080p is skipped.
        assert.deepEqual(resolutions, ["1280x720", "854x480", "640x360"]);
        const variants = master
            .split("\n")
            .filter((line) => line && !line.startsWith("#"));
        for (const variant of variants) {
            const variantUrl = new URL(variant, masterUrl).toString();
            const playlist = await (
                await fetch(variantUrl, { headers: origin })
            ).text();
            const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist)?.[1];
            assert(init, `no init file in ${variant}`);
            const segment = playlist
                .split("\n")
                .find((line) => line && !line.startsWith("#"));
            assert(segment, `no segment in ${variant}`);
            for (const file of [init, segment]) {
                const fileUrl = new URL(file, variantUrl).toString();
                if (access === "private") {
                    assert.match(
                        file,
                        /^https?:\/\//,
                        "segments are signed URLs",
                    );
                }
                const response = await fetch(fileUrl);
                assert.equal(response.status, 200, `GET ${file}`);
                assert.ok((await response.arrayBuffer()).byteLength > 0);
            }
        }
        if (access === "private") {
            const tampered = masterUrl.replace(
                /\/hls\/(\d+)\./,
                (_m, expiry) => `/hls/${Number(expiry) + 60}.`,
            );
            assert.equal((await fetch(tampered)).status, 403);
            const unknown = masterUrl.replace("master.m3u8", "v99/index.m3u8");
            assert.equal((await fetch(unknown)).status, 404);
        }
    }

    const settings = async () =>
        (await api("settings/media/get")) as unknown as VideoSettings &
            JsonObject;

    log(`MediaLit video run against ${base.origin}${base.pathname}`);
    let failure: unknown;
    try {
        original = await settings();
        assert.ok(
            ["off", "hls", "mp4"].includes(original.videoStreaming),
            `videoStreaming is ${original.videoStreaming}`,
        );
        assert.ok(Array.isArray(original.hlsRenditions));

        // Only the fields given change; renditions are deduplicated and
        // sorted largest first.
        await api("settings/media/create", {
            videoStreaming: "mp4",
            hlsRenditions: ["480p", "1080p", "480p"],
        });
        let current = await settings();
        assert.equal(current.videoStreaming, "mp4");
        assert.deepEqual(current.hlsRenditions, ["1080p", "480p"]);
        assert.equal(current.useWebP, original.useWebP);
        assert.equal(current.webpOutputQuality, original.webpOutputQuality);
        log("PASS video settings: set, deduplicated and sorted");

        for (const bad of [
            { videoStreaming: "dash" },
            // No account-wide default to go back to: each app chooses.
            { videoStreaming: null },
            { hlsRenditions: ["4k"] },
            { hlsRenditions: ["2160p"] },
            { hlsRenditions: [] },
        ]) {
            const refused = await call("settings/media/create", bad);
            assert.equal(
                refused.status,
                400,
                `${JSON.stringify(bad)} was accepted`,
            );
        }
        assert.equal((await settings()).videoStreaming, "mp4");
        log("PASS video settings: invalid values are refused");

        // null sets the renditions back to the default sizes.
        await api("settings/media/create", { hlsRenditions: null });
        current = await settings();
        assert.equal(current.videoStreaming, "mp4");
        assert.deepEqual(current.hlsRenditions, ["1080p", "720p", "480p"]);
        log("PASS video settings: null restores the default renditions");

        // Captions (pipelines-phase-2.md, D1): off until set, and the
        // server says whether a transcription worker is running.
        assert.equal(typeof current.captionsAvailable, "boolean");
        await api("settings/media/create", { generateCaptions: true });
        current = await settings();
        assert.equal(current.generateCaptions, true);
        assert.equal(current.videoStreaming, "mp4");
        const refusedCaptions = await call("settings/media/create", {
            generateCaptions: "yes",
        });
        assert.equal(refusedCaptions.status, 400);
        await api("settings/media/create", { generateCaptions: false });
        assert.equal((await settings()).generateCaptions, false);
        log("PASS captions setting: set, read back and validated");

        const stats = await api("media/get/size");
        const minutes = object(stats.processingMinutes);
        assert.equal(typeof minutes.used, "number");
        assert.ok(
            minutes.allowed === null || typeof minutes.allowed === "number",
        );
        log(
            `PASS storage stats report processing minutes (${minutes.used} of ${minutes.allowed ?? "no limit"})`,
        );

        // Metadata is read at seal (D2): none while temp, then stored.
        const video = generateVideo({ width: 320, height: 180, seconds: 2 });
        if (!video) {
            log("SKIP video metadata (ffmpeg is not installed here)");
        } else {
            const uploaded = await upload(video, "clip.mp4", "video/mp4");
            assert.equal(uploaded.metadata, null);
            const sealed = await seal(uploaded.mediaId);
            const meta = object(sealed.metadata);
            assert.equal(meta.kind, "video");
            assert.equal(meta.width, 320);
            assert.equal(meta.height, 180);
            assert.equal(meta.videoCodec, "h264");
            assert.equal(meta.audioCodec, "aac");
            assert.ok(Math.abs(Number(meta.durationSeconds) - 2) < 0.3);
            const fetched = await api(
                `media/get/${encodeURIComponent(String(uploaded.mediaId))}`,
            );
            assert.deepEqual(fetched.metadata, sealed.metadata);
            log("PASS video metadata read at seal and returned by get");

            // The worker makes a poster and publishes it over thumb.webp
            // (D9); processing then settles.
            assert.deepEqual(sealed.processing, { status: "processing" });
            const done = await waitForProcessing(uploaded.mediaId);
            assert.deepEqual(done.processing, { status: "ready" });
            const poster = object(object(done.derivatives).thumbnail);
            assert.equal(poster.status, "ready");
            assert.match(String(poster.url), /\/thumb\.webp(\?|$)/);
            const posterBytes = Buffer.from(
                await (await fetch(String(poster.url))).arrayBuffer(),
            );
            assert(isWebp(posterBytes), "The poster is not WebP");
            log("PASS the worker made a poster and processing settled");

            // MP4 for the web (D7): an H.264/AAC upload is remuxed for
            // free; VP9 is re-encoded and counts processing minutes.
            await api("settings/media/create", { videoStreaming: "mp4" });
            const minutesBefore = Number(
                object((await api("media/get/size")).processingMinutes).used,
            );
            const remuxSource = await upload(video, "remux.mp4", "video/mp4");
            await seal(remuxSource.mediaId);
            const remuxed = await waitForProcessing(remuxSource.mediaId);
            const mp4 = object(object(remuxed.derivatives).mp4);
            assert.equal(mp4.status, "ready", JSON.stringify(mp4));
            const web = Buffer.from(
                await (await fetch(String(mp4.url))).arrayBuffer(),
            );
            assert.ok(web.indexOf("moov") < web.indexOf("mdat"), "faststart");
            assert.equal(
                Number(
                    object((await api("media/get/size")).processingMinutes)
                        .used,
                ),
                minutesBefore,
                "a remux is free",
            );
            log("PASS mp4: H.264/AAC remuxed with faststart, no minutes");

            const vp9 = generateVideo({
                width: 320,
                height: 180,
                seconds: 2,
                codec: "vp9",
            });
            assert(vp9, "ffmpeg made the VP9 video");
            const vp9Source = await upload(vp9, "clip.webm", "video/webm");
            await seal(vp9Source.mediaId);
            const encoded = await waitForProcessing(vp9Source.mediaId);
            const encodedMp4 = object(object(encoded.derivatives).mp4);
            assert.equal(encodedMp4.status, "ready");
            const minutes = object(
                (await api("media/get/size")).processingMinutes,
            );
            if (minutes.allowed !== null) {
                assert.equal(Number(minutes.used), minutesBefore + 1);
            }
            log("PASS mp4: VP9 re-encoded to H.264, one minute charged");

            // A seal can override the app's setting for one upload
            // (pipelines-phase-2.md, D9). The app has MP4 on here.
            const trial = await upload(video, "trial.mp4", "video/mp4");
            const refusedSeal = await call(
                `media/seal/${encodeURIComponent(String(trial.mediaId))}`,
                { processing: { videoStreaming: "dash" } },
            );
            assert.equal(refusedSeal.status, 400, "a bad override is refused");
            const stillTemp = await api(
                `media/get/${encodeURIComponent(String(trial.mediaId))}`,
            );
            assert.equal(
                object(stillTemp.processing).status,
                "pending",
                "a refused seal leaves the media temporary",
            );
            const overridden = await api(
                `media/seal/${encodeURIComponent(String(trial.mediaId))}`,
                { processing: { videoStreaming: "off" } },
            );
            assert.equal(object(overridden.derivatives).mp4, undefined);
            const trialDone = await waitForProcessing(trial.mediaId);
            assert.deepEqual(Object.keys(object(trialDone.derivatives)), [
                "thumbnail",
            ]);
            log(
                "PASS seal override: off skips the app's MP4, a bad value is a 400",
            );

            // HLS (D5, D6): renditions capped at the source; private media
            // plays through the API's signed playlists, public from storage.
            await api("settings/media/create", {
                videoStreaming: "hls",
                hlsRenditions: ["1080p", "720p", "480p", "360p"],
            });
            const hd = generateVideo({ width: 1280, height: 720, seconds: 8 });
            assert(hd, "ffmpeg made the 720p video");
            for (const access of ["private", "public"] as const) {
                const hlsSource = await upload(
                    hd,
                    `hls-${access}.mp4`,
                    "video/mp4",
                    access,
                );
                await seal(hlsSource.mediaId);
                const streamed = await waitForProcessing(
                    hlsSource.mediaId,
                    240_000,
                );
                const hls = object(object(streamed.derivatives).hls);
                assert.equal(hls.status, "ready", JSON.stringify(hls));
                await checkHls(String(hls.url), access);
                log(
                    `PASS hls: ${access} media plays through its master playlist`,
                );
            }
        }
        // Captions (pipelines-phase-2.md, D2, D8, D10), made by the stack's
        // worker with the fake transcriber.
        const spoken = generateVideo({ width: 320, height: 180, seconds: 6 });
        const tone = generateAudio(6);
        const silent = generateVideo({
            width: 320,
            height: 180,
            seconds: 2,
            audio: false,
        });
        if (!spoken || !tone || !silent) {
            log("SKIP captions (ffmpeg is not installed here)");
        } else if (!(await settings()).captionsAvailable) {
            log("SKIP captions (no transcription worker is running)");
        } else {
            await api("settings/media/create", {
                videoStreaming: "off",
                generateCaptions: true,
            });
            for (const access of ["private", "public"] as const) {
                const source = await upload(
                    spoken,
                    `captions-${access}.mp4`,
                    "video/mp4",
                    access,
                );
                await seal(source.mediaId);
                // The media settles without waiting for captions (D8).
                await waitForProcessing(source.mediaId);
                const done = await waitForCaptions(source.mediaId);
                assert.deepEqual(done.processing, { status: "ready" });
                await checkCaptions(done, access);
                log(`PASS captions: ${access} video gets VTT and transcripts`);
            }

            // An audio upload settles at seal; captions follow.
            const audio = await upload(tone, "tone.wav", "audio/wav");
            const sealedAudio = await seal(audio.mediaId);
            assert.deepEqual(sealedAudio.processing, { status: "ready" });
            await checkCaptions(
                await waitForCaptions(audio.mediaId),
                "private",
            );
            log(
                "PASS captions: an audio upload settles at seal, then captions",
            );

            // Seal knows there's no audio: no captions job at all.
            const mute = await upload(silent, "mute.mp4", "video/mp4");
            const sealedMute = await seal(mute.mediaId);
            assert.equal(object(sealedMute.derivatives).captions, undefined);
            log("PASS captions: a video with no audio gets none");

            // The seal override turns them off for one upload (D9).
            const skipped = await upload(spoken, "skip.mp4", "video/mp4");
            const sealedSkip = await api(
                `media/seal/${encodeURIComponent(String(skipped.mediaId))}`,
                { processing: { generateCaptions: false } },
            );
            assert.equal(object(sealedSkip.derivatives).captions, undefined);
            log("PASS captions: the seal override turns them off");
        }

        const image = await upload(
            generatePng(64, 36),
            "image.png",
            "image/png",
        );
        const sealedImage = await seal(image.mediaId);
        const imageMeta = object(sealedImage.metadata);
        assert.equal(imageMeta.kind, "image");
        assert.equal(imageMeta.width, 64);
        assert.equal(imageMeta.height, 36);
        log("PASS image metadata read at seal");
    } catch (error) {
        failure = error;
    } finally {
        for (const mediaId of created) {
            const deleted = await call(
                `media/delete/${encodeURIComponent(mediaId)}`,
                undefined,
                "DELETE",
            ).catch((error) => ({ status: 0, body: String(error) }));
            if (deleted.status !== 200) {
                log(
                    `CLEANUP FAILED for ${mediaId}: ${JSON.stringify(deleted.body)}`,
                );
                failure ??= new Error(`Could not delete ${mediaId}`);
            }
        }
        if (original) {
            try {
                await api("settings/media/create", {
                    videoStreaming: original.videoStreaming,
                    hlsRenditions: original.hlsRenditions,
                    ...(typeof original.generateCaptions === "boolean"
                        ? { generateCaptions: original.generateCaptions }
                        : {}),
                });
            } catch (error) {
                log(
                    `CLEANUP failed to restore video settings: ${String(error)}`,
                );
                failure ??= error;
            }
        }
    }
    if (failure) throw failure;
    log("PASS video settings, processing minutes and metadata");
}
