import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { findExecutable } from "@medialit/images";
import { canRemux, mp4Args } from "./mp4.js";
import { probeMedia, type ProbeResult } from "./probe.js";

const ffmpeg = findExecutable("ffmpeg");
const ffprobe = findExecutable("ffprobe");
const dir = mkdtempSync(path.join(tmpdir(), "mp4-test-"));

function make(name: string, args: string[]): string {
    const file = path.join(dir, name);
    execFileSync(ffmpeg!, ["-v", "error", "-y", ...args, file]);
    return file;
}

function video(
    name: string,
    size: string,
    codec: string[],
    audio: string[] = [],
): string {
    return make(name, [
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=${size}:rate=25:duration=2`,
        ...(audio.length
            ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=2"]
            : []),
        ...codec,
        ...audio,
        "-shortest",
    ]);
}

/** MD5 of a stream's packets, to compare a remux with its source. */
function streamMd5(file: string, stream: string): string {
    return execFileSync(
        ffmpeg!,
        [
            "-v",
            "error",
            "-i",
            file,
            "-map",
            stream,
            "-c",
            "copy",
            "-f",
            "md5",
            "-",
        ],
        { encoding: "utf8" },
    ).trim();
}

async function encode(source: string, name: string) {
    const probe = (await probeMedia(source, { timeoutMs: 30_000 }))!;
    const output = path.join(dir, name);
    const remux = canRemux(probe);
    execFileSync(
        ffmpeg!,
        mp4Args({ source, output, remux, maxDurationSeconds: 7200 }),
        { stdio: "ignore" },
    );
    const result = (await probeMedia(output, { timeoutMs: 30_000 }))!;
    return { probe, remux, output, result };
}

function probeOf(
    overrides: Partial<ProbeResult["metadata"]>,
    details: Partial<ProbeResult["details"]> = {},
): ProbeResult {
    return {
        metadata: {
            kind: "video",
            width: 1280,
            height: 720,
            videoCodec: "h264",
            audioCodec: "aac",
            bitrate: 2_000_000,
            ...overrides,
        },
        details: {
            hasVideo: true,
            hasAudio: true,
            pixelFormat: "yuv420p",
            formatNames: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
            ...details,
        },
    };
}

describe("canRemux", () => {
    test("only H.264/AAC MP4 or MOV, 8-bit 4:2:0, up to 1080p and 8 Mbps", () => {
        assert.equal(canRemux(probeOf({})), true);
        assert.equal(
            canRemux(probeOf({ audioCodec: undefined }, { hasAudio: false })),
            true,
        );
        assert.equal(canRemux(probeOf({ videoCodec: "hevc" })), false);
        assert.equal(canRemux(probeOf({ audioCodec: "opus" })), false);
        assert.equal(
            canRemux(probeOf({}, { pixelFormat: "yuv420p10le" })),
            false,
        );
        assert.equal(
            canRemux(probeOf({}, { formatNames: ["matroska", "webm"] })),
            false,
        );
        assert.equal(canRemux(probeOf({ width: 2560, height: 1440 })), false);
        assert.equal(canRemux(probeOf({ width: 1080, height: 1920 })), true);
        assert.equal(canRemux(probeOf({ bitrate: 12_000_000 })), false);
    });
});

describe(
    "mp4Args with ffmpeg",
    {
        skip:
            ffmpeg && ffprobe ? false : "ffmpeg and ffprobe are not installed",
    },
    () => {
        test("remuxes an H.264/AAC MP4: same streams, index at the front", async () => {
            const source = video(
                "h264.mp4",
                "1280x720",
                ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
                ["-c:a", "aac"],
            );
            const { remux, output } = await encode(source, "h264-web.mp4");
            assert.equal(remux, true);
            assert.equal(
                streamMd5(output, "0:v:0"),
                streamMd5(source, "0:v:0"),
            );
            assert.equal(
                streamMd5(output, "0:a:0"),
                streamMd5(source, "0:a:0"),
            );
            const bytes = readFileSync(output);
            assert.ok(
                bytes.indexOf("moov") < bytes.indexOf("mdat"),
                "moov comes before mdat",
            );
        });

        test("re-encodes VP9 to H.264/AAC, capped at 1080p, with even sides", async () => {
            const source = video(
                "vp9.webm",
                "2560x1440",
                ["-c:v", "libvpx-vp9", "-deadline", "realtime"],
                ["-c:a", "libopus"],
            );
            const { remux, result } = await encode(source, "vp9-web.mp4");
            assert.equal(remux, false);
            assert.equal(result.metadata.videoCodec, "h264");
            assert.equal(result.metadata.audioCodec, "aac");
            assert.equal(result.metadata.channels, 2);
            assert.deepEqual(
                [result.metadata.width, result.metadata.height],
                [1920, 1080],
            );
        });

        test("never upscales, and keeps a portrait video upright", async () => {
            const small = video("small.webm", "320x180", [
                "-c:v",
                "libvpx-vp9",
                "-deadline",
                "realtime",
            ]);
            const { result } = await encode(small, "small-web.mp4");
            assert.deepEqual(
                [result.metadata.width, result.metadata.height],
                [320, 180],
            );
            assert.equal(result.metadata.audioCodec, undefined);

            const portrait = video("portrait.webm", "1440x2560", [
                "-c:v",
                "libvpx-vp9",
                "-deadline",
                "realtime",
            ]);
            const upright = await encode(portrait, "portrait-web.mp4");
            assert.deepEqual(
                [upright.result.metadata.width, upright.result.metadata.height],
                [1080, 1920],
            );
        });
    },
);
