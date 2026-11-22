import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    VideoSettingsError,
    defaultVideoStreaming,
    effectiveVideoSettings,
    normalizeRenditions,
} from "./video.js";

describe("video settings", () => {
    test("new apps follow the plan: hls on self-hosted and paid, off on free", () => {
        assert.equal(defaultVideoStreaming("oss"), "hls");
        assert.equal(defaultVideoStreaming("pro"), "hls");
        assert.equal(defaultVideoStreaming("basic"), "off");
    });

    test("an app that chose keeps its choice whatever the plan", () => {
        assert.deepEqual(
            effectiveVideoSettings({ videoStreaming: "mp4" }, "basic"),
            {
                videoStreaming: "mp4",
                videoStreamingDefault: false,
                hlsRenditions: ["1080p", "720p", "480p"],
            },
        );
        assert.deepEqual(effectiveVideoSettings(null, "pro"), {
            videoStreaming: "hls",
            videoStreamingDefault: true,
            hlsRenditions: ["1080p", "720p", "480p"],
        });
        assert.deepEqual(
            effectiveVideoSettings(
                { videoStreaming: null, hlsRenditions: ["360p", "720p"] },
                "basic",
            ),
            {
                videoStreaming: "off",
                videoStreamingDefault: true,
                hlsRenditions: ["720p", "360p"],
            },
        );
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
