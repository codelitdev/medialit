import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sealOptions, upload } from "../src/commands";

describe("--video-streaming on upload and seal", () => {
    test("becomes the seal's processing override", () => {
        assert.deepEqual(sealOptions({ videoStreaming: " OFF " }), {
            processing: { videoStreaming: "off" },
        });
        assert.deepEqual(sealOptions({ videoStreaming: "mp4" }), {
            processing: { videoStreaming: "mp4" },
        });
        assert.deepEqual(sealOptions({}), {});
        assert.deepEqual(
            sealOptions({ captions: "off", videoStreaming: "hls" }),
            { processing: { videoStreaming: "hls", generateCaptions: false } },
        );
        assert.throws(() => sealOptions({ captions: "yes" }), /on or off/);
    });

    test("a bad value is refused before anything is sent", async () => {
        assert.throws(
            () => sealOptions({ videoStreaming: "dash" }),
            /must be off, hls or mp4/,
        );
        await assert.rejects(
            upload(["missing.mp4"], { videoStreaming: "dash" }),
            /must be off, hls or mp4/,
        );
    });

    test("can't be combined with --temp, which doesn't seal", async () => {
        await assert.rejects(
            upload(["missing.mp4"], { videoStreaming: "off", temp: true }),
            /apply when a file is sealed/,
        );
    });
});

test("get notes the captions on stderr: ready, failed or pending", async () => {
    const { captionsNote } = await import("../src/commands");
    assert.equal(captionsNote({ derivatives: {} }), null);
    assert.equal(
        captionsNote({
            derivatives: {
                captions: {
                    status: "ready",
                    url: "https://x/c.vtt",
                    language: "en",
                },
            },
        }),
        "Captions (en): https://x/c.vtt",
    );
    assert.equal(
        captionsNote({
            derivatives: {
                captions: { status: "failed", error: "no_audio_stream: none" },
            },
        }),
        "Captions failed: no_audio_stream: none",
    );
    assert.equal(
        captionsNote({ derivatives: { captions: { status: "queued" } } }),
        "Captions: queued",
    );
});
