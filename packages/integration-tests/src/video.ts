/**
 * Video settings and processing (pipelines-phase-1.md), against a live API:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:video
 *
 * Changes the app's video settings, then restores them. Use a test app with
 * no concurrent media writes.
 */
import assert from "node:assert/strict";
import { generatePng, generateVideo } from "./utils";

type JsonObject = Record<string, unknown>;

interface VideoSettings {
    videoStreaming: string;
    videoStreamingDefault: boolean;
    hlsRenditions: string[];
}

function object(value: unknown): JsonObject {
    assert(
        value && typeof value === "object" && !Array.isArray(value),
        "Expected a JSON object",
    );
    return value as JsonObject;
}

export async function runVideoIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const apiKey = options.apiKey ?? process.env.MEDIALIT_APIKEY;
    assert(apiKey?.trim(), "MEDIALIT_APIKEY is required");
    const server =
        options.server ?? process.env.MEDIALIT_SERVER ?? "localhost:8000";
    const base = new URL(
        /^https?:\/\//i.test(server) ? server : `http://${server}`,
    );
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    const log = options.log ?? console.log;
    let original: VideoSettings | undefined;
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
        assert.equal(typeof original.videoStreamingDefault, "boolean");
        assert.ok(Array.isArray(original.hlsRenditions));

        // Only the fields given change; renditions are deduplicated and
        // sorted largest first.
        const before = await settings();
        await api("settings/media/create", {
            videoStreaming: "mp4",
            hlsRenditions: ["480p", "1080p", "480p"],
        });
        let current = await settings();
        assert.equal(current.videoStreaming, "mp4");
        assert.equal(current.videoStreamingDefault, false);
        assert.deepEqual(current.hlsRenditions, ["1080p", "480p"]);
        assert.equal(current.useWebP, before.useWebP);
        assert.equal(current.thumbnailWidth, before.thumbnailWidth);
        log("PASS video settings: set, deduplicated and sorted");

        for (const bad of [
            { videoStreaming: "dash" },
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

        // null goes back to the plan's default.
        await api("settings/media/create", {
            videoStreaming: null,
            hlsRenditions: null,
        });
        current = await settings();
        assert.equal(current.videoStreamingDefault, true);
        assert.deepEqual(current.hlsRenditions, ["1080p", "720p", "480p"]);
        log(
            `PASS video settings: null restores the plan default (${current.videoStreaming})`,
        );

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
            assert.equal(posterBytes.toString("ascii", 8, 12), "WEBP");
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
            if (vp9) {
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
            }
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
                    videoStreaming: original.videoStreamingDefault
                        ? null
                        : original.videoStreaming,
                    hlsRenditions: original.hlsRenditions,
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
