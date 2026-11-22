import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { videoSources } from "../src/medialit-video";

describe("videoSources", () => {
    test("plays HLS when ready, then the web MP4, then the original", () => {
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
            [
                { kind: "hls", url: "https://api.example/m.m3u8" },
                { kind: "mp4", url: "https://cdn.example/web.mp4" },
                { kind: "file", url: "https://cdn.example/main.mov" },
            ],
        );
    });

    test("skips derivatives that aren't ready, and works on older servers", () => {
        assert.deepEqual(
            videoSources({
                file: "https://cdn.example/main.mp4",
                derivatives: { hls: { status: "processing" } },
            }),
            [{ kind: "file", url: "https://cdn.example/main.mp4" }],
        );
        assert.deepEqual(videoSources({ file: "https://cdn.example/a.mp4" }), [
            { kind: "file", url: "https://cdn.example/a.mp4" },
        ]);
        assert.deepEqual(videoSources({}), []);
    });
});
