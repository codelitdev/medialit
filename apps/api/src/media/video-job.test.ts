import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diskBoundSeconds } from "./video-job.js";

const GiB = 1024 * 1024 * 1024;

describe("diskBoundSeconds", () => {
    test("a 1 GB source and a capped 1080p ladder fit about 2 hours in 10 GiB", () => {
        // 5000 + 2800 + 1400 kbps of video, 128 kbps of audio in each.
        const seconds = diskBoundSeconds({
            budgetBytes: 10 * GiB,
            sourceBytes: 1 * GiB,
            outputKbps: 5000 + 2800 + 1400 + 3 * 128,
            maxDurationSeconds: 7200,
        });
        assert.equal(seconds, 7200, "capped by VIDEO_MAX_DURATION_SECONDS");
        assert.equal(
            diskBoundSeconds({
                budgetBytes: 5 * GiB,
                sourceBytes: 1 * GiB,
                outputKbps: 9584,
                maxDurationSeconds: 7200,
            }),
            Math.floor((4 * GiB) / ((9584 * 1000) / 8)),
            "a 5 GiB budget fits about an hour",
        );
    });

    test("no room left means no output", () => {
        assert.equal(
            diskBoundSeconds({
                budgetBytes: GiB,
                sourceBytes: 2 * GiB,
                outputKbps: 5128,
                maxDurationSeconds: 7200,
            }),
            0,
        );
    });
});
