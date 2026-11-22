/**
 * Video settings and processing (pipelines-phase-1.md), against a live API:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:video
 *
 * Changes the app's video settings, then restores them. Use a test app with
 * no concurrent media writes.
 */
import assert from "node:assert/strict";

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

    async function call(path: string, body?: JsonObject) {
        const response = await fetch(new URL(path, base), {
            method: "POST",
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
    } catch (error) {
        failure = error;
    } finally {
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
    log("PASS video settings and processing minutes");
}
