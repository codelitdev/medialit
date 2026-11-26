import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hlsPlayback, videoSources } from "../src/medialit-video";

describe("videoSources", () => {
    test("plays HLS when ready, with the web MP4 as the fallback", () => {
        assert.deepEqual(
            videoSources({
                file: "https://cdn.example/main.mov",
                derivatives: {
                    hls: { status: "ready", url: "https://api.example/m.m3u8" },
                    mp4: {
                        status: "ready",
                        url: "https://cdn.example/web.mp4",
                    },
                    thumbnail: {
                        status: "ready",
                        url: "https://cdn.example/t",
                    },
                },
            }),
            {
                hls: "https://api.example/m.m3u8",
                fallback: "https://cdn.example/web.mp4",
            },
        );
    });

    test("skips derivatives that aren't ready, and works on older servers", () => {
        assert.deepEqual(
            videoSources({
                file: "https://cdn.example/main.mp4",
                derivatives: { hls: { status: "processing" } },
            }),
            { hls: undefined, fallback: "https://cdn.example/main.mp4" },
        );
        assert.deepEqual(videoSources({ file: "https://cdn.example/a.mp4" }), {
            hls: undefined,
            fallback: "https://cdn.example/a.mp4",
        });
        assert.deepEqual(videoSources({}), {
            hls: undefined,
            fallback: undefined,
        });
    });
});

describe("hlsPlayback", () => {
    test("uses hls.js wherever Media Source Extensions exist, even when the browser claims native HLS", () => {
        // Desktop Chrome and Edge answer "maybe" for native HLS but can
        // fail to play it on Windows.
        assert.equal(
            hlsPlayback({ mediaSource: true, nativeHls: true }),
            "hls.js",
        );
        assert.equal(
            hlsPlayback({ mediaSource: true, nativeHls: false }),
            "hls.js",
        );
    });

    test("plays natively without Media Source Extensions, as on iPhone", () => {
        assert.equal(
            hlsPlayback({ mediaSource: false, nativeHls: true }),
            "native",
        );
    });

    test("can't play HLS with neither", () => {
        assert.equal(
            hlsPlayback({ mediaSource: false, nativeHls: false }),
            "none",
        );
    });
});
