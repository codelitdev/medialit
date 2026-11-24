import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { videoSources } from "../src/medialit-video";

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
