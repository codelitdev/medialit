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
            /applies when a file is sealed/,
        );
    });
});
