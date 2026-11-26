import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { findExecutable } from "@medialit/images";
import { imageMetadata, parseProbe, probeMedia } from "./probe.js";
import { makeTestVideo } from "./test-video.js";

function probeJson(streams: unknown[], format: Record<string, unknown>) {
    return JSON.stringify({ streams, format });
}

describe("parseProbe", () => {
    test("reads a phone video held upright: size as displayed, rotation and codecs", () => {
        const result = parseProbe(
            probeJson(
                [
                    {
                        codec_type: "video",
                        codec_name: "h264",
                        width: 1920,
                        height: 1080,
                        pix_fmt: "yuv420p",
                        avg_frame_rate: "30000/1001",
                        side_data_list: [
                            { side_data_type: "Display Matrix", rotation: -90 },
                        ],
                    },
                    {
                        codec_type: "audio",
                        codec_name: "aac",
                        sample_rate: "48000",
                        channels: 2,
                    },
                ],
                {
                    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
                    duration: "12.345678",
                    bit_rate: "8123456",
                },
            ),
        );
        assert.deepEqual(result?.metadata, {
            kind: "video",
            durationSeconds: 12.346,
            width: 1080,
            height: 1920,
            rotation: 270,
            frameRate: 29.97,
            videoCodec: "h264",
            audioCodec: "aac",
            sampleRate: 48000,
            channels: 2,
            bitrate: 8123456,
            format: "mov",
        });
        assert.deepEqual(result?.details, {
            hasVideo: true,
            hasAudio: true,
            pixelFormat: "yuv420p",
            formatNames: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
        });
    });

    test("treats cover art in an audio file as audio, not video", () => {
        const result = parseProbe(
            probeJson(
                [
                    {
                        codec_type: "audio",
                        codec_name: "mp3",
                        sample_rate: "44100",
                        channels: 2,
                    },
                    {
                        codec_type: "video",
                        codec_name: "mjpeg",
                        width: 500,
                        height: 500,
                        disposition: { attached_pic: 1 },
                    },
                ],
                { format_name: "mp3", duration: "61.5" },
            ),
        );
        assert.deepEqual(result?.metadata, {
            kind: "audio",
            durationSeconds: 61.5,
            audioCodec: "mp3",
            sampleRate: 44100,
            channels: 2,
            format: "mp3",
        });
        assert.equal(result?.details.hasVideo, false);
    });

    test("a video with no audio has no audioCodec", () => {
        const result = parseProbe(
            probeJson(
                [
                    {
                        codec_type: "video",
                        codec_name: "vp9",
                        width: 640,
                        height: 360,
                    },
                ],
                { format_name: "matroska,webm", duration: "2" },
            ),
        );
        assert.equal(result?.metadata.audioCodec, undefined);
        assert.equal(result?.details.hasAudio, false);
        assert.equal(result?.metadata.rotation, 0);
    });

    test("returns null for no streams or bad output", () => {
        assert.equal(parseProbe(probeJson([], { format_name: "mov" })), null);
        assert.equal(parseProbe("not json"), null);
        assert.equal(parseProbe(probeJson([{ codec_type: "data" }], {})), null);
    });
});

describe("imageMetadata", () => {
    test("reads a PNG header and refuses what isn't an image", async () => {
        const png = Buffer.alloc(32);
        png.writeUInt32BE(0x89504e47, 0);
        png.writeUInt32BE(0x0d0a1a0a, 4);
        png.writeUInt32BE(13, 8);
        png.write("IHDR", 12, "ascii");
        png.writeUInt32BE(640, 16);
        png.writeUInt32BE(360, 20);
        assert.deepEqual(await imageMetadata(png), {
            kind: "image",
            width: 640,
            height: 360,
            format: "png",
        });
        assert.equal(await imageMetadata(Buffer.from("hello")), null);
    });
});

const ffmpeg = findExecutable("ffmpeg");
const ffprobe = findExecutable("ffprobe");

describe(
    "probeMedia with ffprobe",
    {
        skip:
            ffmpeg && ffprobe ? false : "ffmpeg and ffprobe are not installed",
    },
    () => {
        const dir = mkdtempSync(path.join(tmpdir(), "probe-test-"));

        test("reads a real video file", async () => {
            const file = makeTestVideo(path.join(dir, "clip.mp4"), {
                size: "320x180",
                audio: true,
                ffmpeg: ffmpeg!,
            });
            const result = await probeMedia(file, { timeoutMs: 10_000 });
            assert.equal(result?.metadata.kind, "video");
            assert.equal(result?.metadata.width, 320);
            assert.equal(result?.metadata.height, 180);
            assert.equal(result?.metadata.videoCodec, "h264");
            assert.equal(result?.metadata.audioCodec, "aac");
            assert.ok(
                Math.abs((result?.metadata.durationSeconds ?? 0) - 2) < 0.2,
            );
        });

        test("refuses a playlist posing as a video instead of fetching its URLs", async () => {
            const file = path.join(dir, "playlist.mp4");
            writeFileSync(
                file,
                "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://169.254.169.254/latest/meta-data\n#EXT-X-ENDLIST\n",
            );
            await assert.rejects(probeMedia(file, { timeoutMs: 10_000 }));
        });
    },
);
