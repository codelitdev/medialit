import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { findExecutable, runLimited } from "@medialit/images";
import { hlsArgs, planRenditions } from "./hls.js";
import { videoLimits } from "./video-job.js";

const ffmpeg = findExecutable("ffmpeg");
const dir = mkdtempSync(path.join(tmpdir(), "hls-test-"));

describe("planRenditions", () => {
    const defaults = ["1080p", "720p", "480p"];

    test("skips renditions larger than the source", () => {
        assert.deepEqual(
            planRenditions(defaults, { width: 1280, height: 720 }),
            [
                { name: "720p", width: 1280, height: 720, maxrateKbps: 2800 },
                { name: "480p", width: 854, height: 480, maxrateKbps: 1400 },
            ],
        );
    });

    test("compares portrait videos on the short side", () => {
        assert.deepEqual(
            planRenditions(defaults, { width: 1080, height: 1920 }).map((r) => [
                r.name,
                r.width,
                r.height,
            ]),
            [
                ["1080p", 1080, 1920],
                ["720p", 720, 1280],
                ["480p", 480, 854],
            ],
        );
    });

    test("makes one rendition at the source's size when none fit", () => {
        assert.deepEqual(
            planRenditions(defaults, { width: 426, height: 240 }),
            [{ name: "240p", width: 426, height: 240, maxrateKbps: 800 }],
        );
        assert.deepEqual(
            planRenditions(["1080p"], { width: 1280, height: 720 }),
            [{ name: "720p", width: 1280, height: 720, maxrateKbps: 2800 }],
        );
    });
});

describe(
    "hlsArgs with ffmpeg",
    {
        skip: ffmpeg ? false : "ffmpeg is not installed",
    },
    () => {
        function source(name: string, size: string, audio: boolean): string {
            const file = path.join(dir, name);
            execFileSync(ffmpeg!, [
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                `testsrc=size=${size}:rate=25:duration=8`,
                ...(audio
                    ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=8"]
                    : []),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                ...(audio ? ["-c:a", "aac"] : []),
                "-shortest",
                file,
            ]);
            return file;
        }

        /** Encodes as the worker does: under the address-space guard and
         * with the thread count of the defaults (VIDEO_MAX_MEMORY_MB,
         * VIDEO_ENCODE_THREADS). */
        async function encode(name: string, size: string, audio: boolean) {
            const [w, h] = size.split("x").map(Number);
            const renditions = planRenditions(["1080p", "720p", "480p"], {
                width: w,
                height: h,
            });
            const outDir = path.join(dir, `${name}-hls`);
            const limits = videoLimits();
            await runLimited(
                "ffmpeg",
                hlsArgs({
                    source: source(`${name}.mp4`, size, audio),
                    outDir,
                    renditions,
                    hasAudio: audio,
                    maxDurationSeconds: 7200,
                    threads: limits.threads,
                }),
                { timeoutMs: 120_000, memoryMb: limits.maxMemoryMb },
            );
            return { outDir, renditions };
        }

        test("encodes a 1080p ladder under the memory guard", async () => {
            const { outDir, renditions } = await encode(
                "full-hd",
                "1920x1080",
                true,
            );
            assert.equal(renditions.length, 3);
            assert.ok(existsSync(path.join(outDir, "v2", "index.m3u8")));
        });

        test("writes a master playlist and fMP4 renditions with relative URIs", async () => {
            const { outDir, renditions } = await encode(
                "landscape",
                "1280x720",
                true,
            );
            assert.equal(renditions.length, 2);
            const master = readFileSync(
                path.join(outDir, "master.m3u8"),
                "utf8",
            );
            assert.match(
                master,
                /RESOLUTION=1280x720,CODECS="avc1\.[0-9a-f]+,mp4a\.40\.2"/,
            );
            assert.match(master, /RESOLUTION=854x480/);
            assert.match(master, /^v0\/index\.m3u8$/m);
            const v0 = readFileSync(
                path.join(outDir, "v0", "index.m3u8"),
                "utf8",
            );
            assert.match(v0, /#EXT-X-MAP:URI="init_0\.mp4"/);
            assert.match(v0, /^seg00000\.m4s$/m);
            assert.match(v0, /#EXT-X-PLAYLIST-TYPE:VOD/);
            assert.ok(existsSync(path.join(outDir, "v1", "init_1.mp4")));
            assert.doesNotMatch(master + v0, /https?:/);
        });

        test("handles portrait and silent videos", async () => {
            const { outDir } = await encode(
                "portrait-silent",
                "720x1280",
                false,
            );
            const master = readFileSync(
                path.join(outDir, "master.m3u8"),
                "utf8",
            );
            assert.match(
                master,
                /RESOLUTION=720x1280,CODECS="avc1\.[0-9a-f]+"/,
            );
            assert.doesNotMatch(master, /mp4a/);
        });

        test("a source smaller than every rendition gets one at its own size", async () => {
            const { outDir, renditions } = await encode(
                "tiny",
                "426x240",
                true,
            );
            assert.deepEqual(
                renditions.map((r) => r.name),
                ["240p"],
            );
            const master = readFileSync(
                path.join(outDir, "master.m3u8"),
                "utf8",
            );
            assert.match(master, /RESOLUTION=426x240/);
        });
    },
);
