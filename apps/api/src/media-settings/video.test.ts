import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    VideoSettingsError,
    effectiveVideoSettings,
    normalizeRenditions,
} from "./video.js";

describe("video settings", () => {
    test("an app that never chose is off; a choice is kept", () => {
        assert.deepEqual(effectiveVideoSettings(null), {
            videoStreaming: "off",
            hlsRenditions: ["1080p", "720p", "480p"],
        });
        assert.deepEqual(
            effectiveVideoSettings({
                videoStreaming: null,
                hlsRenditions: ["360p", "720p"],
            }),
            { videoStreaming: "off", hlsRenditions: ["720p", "360p"] },
        );
        assert.deepEqual(effectiveVideoSettings({ videoStreaming: "mp4" }), {
            videoStreaming: "mp4",
            hlsRenditions: ["1080p", "720p", "480p"],
        });
    });

    test("renditions are checked, deduplicated and sorted largest first", () => {
        assert.deepEqual(normalizeRenditions(["480p", "1080p", "480p"]), [
            "1080p",
            "480p",
        ]);
        for (const bad of [[], ["4k"], ["1440p"], ["2160p"], "720p", null]) {
            assert.throws(
                () => normalizeRenditions(bad),
                VideoSettingsError,
                JSON.stringify(bad),
            );
        }
    });
});
