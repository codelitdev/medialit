import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { settingsUpdate } from "../src/commands";

describe("medialit settings set", () => {
    test("turns flags into an update with only the given fields", () => {
        assert.deepEqual(
            settingsUpdate({
                videoStreaming: "HLS",
                hlsRenditions: "1080p, 480p",
                webp: "on",
                webpQuality: "80",
            }),
            {
                videoStreaming: "hls",
                hlsRenditions: ["1080p", "480p"],
                useWebP: true,
                webpOutputQuality: 80,
            },
        );
        assert.deepEqual(settingsUpdate({ webp: "off" }), { useWebP: false });
        assert.deepEqual(settingsUpdate({}), {});
    });

    test("default sets the video settings back to the plan's default", () => {
        assert.deepEqual(
            settingsUpdate({
                videoStreaming: "default",
                hlsRenditions: "default",
            }),
            { videoStreaming: null, hlsRenditions: null },
        );
    });

    test("refuses values the server would refuse", () => {
        assert.throws(
            () => settingsUpdate({ videoStreaming: "dash" }),
            /off, hls, mp4 or default/,
        );
        assert.throws(() => settingsUpdate({ webp: "yes" }), /on or off/);
        assert.throws(() => settingsUpdate({ webpQuality: "101" }), /1 to 100/);
        assert.throws(() => settingsUpdate({ webpQuality: "0" }), /1 to 100/);
    });
});
