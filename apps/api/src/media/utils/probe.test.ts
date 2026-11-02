import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { parseProbeOutput, probeMedia } from "./probe";

describe("parseProbeOutput", () => {
    test("reads size and duration", () => {
        assert.deepEqual(
            parseProbeOutput(
                JSON.stringify({
                    streams: [{ width: 1920, height: 1080 }],
                    format: { duration: "4.2" },
                }),
            ),
            { width: 1920, height: 1080, durationMs: 4200 },
        );
    });

    test("swaps the sides of a video recorded sideways", () => {
        for (const rotation of [90, -90, 270]) {
            assert.deepEqual(
                parseProbeOutput(
                    JSON.stringify({
                        streams: [
                            {
                                width: 1920,
                                height: 1080,
                                side_data_list: [{ rotation }],
                            },
                        ],
                        format: { duration: "1" },
                    }),
                ),
                { width: 1080, height: 1920, durationMs: 1000 },
            );
        }
        assert.equal(
            parseProbeOutput(
                JSON.stringify({
                    streams: [
                        {
                            width: 1920,
                            height: 1080,
                            side_data_list: [{ rotation: 180 }],
                        },
                    ],
                }),
            ).width,
            1920,
        );
    });

    test("tolerates missing values and garbage", () => {
        assert.deepEqual(parseProbeOutput("not json"), {});
        assert.deepEqual(
            parseProbeOutput(
                JSON.stringify({
                    streams: [{ width: 0, height: "N/A" }],
                    format: { duration: "N/A" },
                }),
            ),
            { width: undefined, height: undefined, durationMs: undefined },
        );
    });
});

describe("probeMedia", () => {
    test("probes a real image and video, and skips other files", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "probe-"));
        try {
            const image = path.join(dir, "a.png");
            const video = path.join(dir, "a.mp4");
            execFileSync("ffmpeg", [
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=64x48",
                "-frames:v",
                "1",
                image,
            ]);
            execFileSync("ffmpeg", [
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=80x60:d=2:r=10",
                "-pix_fmt",
                "yuv420p",
                video,
            ]);
            assert.deepEqual(await probeMedia(image, "image/png"), {
                width: 64,
                height: 48,
            });
            const clip = await probeMedia(video, "video/mp4");
            assert.equal(clip.width, 80);
            assert.equal(clip.height, 60);
            assert.ok(
                clip.durationMs! >= 1900 && clip.durationMs! <= 2200,
                String(clip.durationMs),
            );

            const text = path.join(dir, "a.txt");
            writeFileSync(text, "hello");
            assert.deepEqual(await probeMedia(text, "text/plain"), {});
            assert.deepEqual(await probeMedia(text, "image/png"), {});
            assert.deepEqual(
                await probeMedia(path.join(dir, "missing.png"), "image/png"),
                {},
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
