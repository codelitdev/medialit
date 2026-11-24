import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { findExecutable } from "@medialit/images";
import thumbnail from "./index";

const hasFfmpeg = Boolean(
    findExecutable("ffmpeg") && findExecutable("ffprobe"),
);
const skip = !hasFfmpeg && "ffmpeg is not installed";
let dir: string;

function ffmpeg(args: string[]): void {
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
}

function dimensions(file: string): string {
    return execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        file,
    ])
        .toString()
        .trim();
}

before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "thumbnail-"));
});

after(async () => {
    await rm(dir, { recursive: true, force: true });
});

test("rejects missing paths", async () => {
    await assert.rejects(thumbnail.forImage("", "out.webp"), /path missing/);
});

function image(name: string, size: string, scale?: string): string {
    const file = path.join(dir, name);
    ffmpeg([
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=${size}`,
        ...(scale ? ["-vf", `scale=${scale}`] : []),
        "-frames:v",
        "1",
        file,
    ]);
    return file;
}

test(
    "image thumbnails keep the old 16:9 crop, at most 480 px tall",
    { skip },
    async () => {
        for (const [size, scale, expected] of [
            ["640x200", undefined, "355,200"],
            ["200x640", undefined, "200,112"],
            ["1600x1200", undefined, "853,480"],
            ["64x36", "1:1", "1,1"],
            ["64x36", "3:1", "3,1"],
        ] as const) {
            const thumb = path.join(dir, `default-${size}-${scale}.webp`);
            await thumbnail.forImage(
                image(`default-${size}-${scale}.png`, size, scale),
                thumb,
            );
            assert.equal(dimensions(thumb), expected, `${size} ${scale ?? ""}`);
        }
    },
);

test(
    "video thumbnails are the first frame at 720 px tall",
    { skip },
    async () => {
        const video = path.join(dir, "default.mp4");
        ffmpeg([
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:duration=1",
            "-pix_fmt",
            "yuv420p",
            video,
        ]);
        const local = createServer((_req, res) => {
            res.setHeader("content-type", "video/mp4");
            createReadStream(video).pipe(res);
        });
        await new Promise<void>((resolve) =>
            local.listen(0, "127.0.0.1", resolve),
        );
        try {
            const { port } = local.address() as AddressInfo;
            const thumb = path.join(dir, "default-video.webp");
            await thumbnail.forVideo(
                `http://127.0.0.1:${port}/default.mp4`,
                thumb,
            );
            assert.equal(dimensions(thumb), "1280,720");
        } finally {
            local.close();
        }
    },
);

test("video thumbnails refuse local files", { skip }, async () => {
    const video = path.join(dir, "local.mp4");
    ffmpeg([
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:duration=1",
        "-pix_fmt",
        "yuv420p",
        video,
    ]);
    await assert.rejects(
        thumbnail.forVideo(video, path.join(dir, "local.webp")),
    );
});
