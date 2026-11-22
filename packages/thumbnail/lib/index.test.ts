import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { findExecutable } from "@medialit/images";
import thumbnail, { coverFilter, MAX_THUMBNAIL_SIDE } from "./index";

const hasFfmpeg = Boolean(
    findExecutable("ffmpeg") && findExecutable("ffprobe"),
);
const skip = !hasFfmpeg && "ffmpeg is not installed";
let dir: string;
let server: Server | undefined;

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
    server?.close();
    await rm(dir, { recursive: true, force: true });
});

test("coverFilter scales to cover, then crops to the exact size", () => {
    assert.equal(
        coverFilter({ width: 120, height: 69 }),
        "scale=120:69:force_original_aspect_ratio=increase,crop=120:69",
    );
    assert.equal(
        coverFilter({ width: 99999, height: 10.4 }),
        `scale=${MAX_THUMBNAIL_SIDE}:10:force_original_aspect_ratio=increase,crop=${MAX_THUMBNAIL_SIDE}:10`,
    );
    assert.throws(() => coverFilter({ width: 0, height: 10 }));
});

test("rejects missing paths", async () => {
    await assert.rejects(
        thumbnail.forImage("", "out.webp", { width: 1, height: 1 }),
        /path missing/,
    );
});

test(
    "image thumbnails are resized and cropped to the requested size",
    { skip },
    async () => {
        const source = path.join(dir, "wide.png");
        ffmpeg([
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x200",
            "-frames:v",
            "1",
            source,
        ]);
        const tall = path.join(dir, "tall.png");
        ffmpeg([
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=200x640",
            "-frames:v",
            "1",
            tall,
        ]);

        const thumb = path.join(dir, "wide.webp");
        await thumbnail.forImage(source, thumb, { width: 120, height: 69 });
        assert.equal(dimensions(thumb), "120,69");

        const tallThumb = path.join(dir, "tall.webp");
        await thumbnail.forImage(tall, tallThumb, { width: 300, height: 100 });
        assert.equal(dimensions(tallThumb), "300,100");
    },
);

test(
    "a 1×1 image still gets a thumbnail of the requested size",
    { skip },
    async () => {
        const source = path.join(dir, "pixel.png");
        ffmpeg([
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=64x36",
            "-vf",
            "scale=1:1",
            "-frames:v",
            "1",
            source,
        ]);
        const thumb = path.join(dir, "pixel.webp");
        await thumbnail.forImage(source, thumb, { width: 120, height: 69 });
        assert.equal(dimensions(thumb), "120,69");
    },
);

test(
    "video thumbnails are resized and cropped to the requested size",
    { skip },
    async () => {
        const video = path.join(dir, "clip.mp4");
        ffmpeg([
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=1280x720:duration=1",
            "-pix_fmt",
            "yuv420p",
            video,
        ]);
        server = createServer((_req, res) => {
            res.setHeader("content-type", "video/mp4");
            createReadStream(video).pipe(res);
        });
        await new Promise<void>((resolve) =>
            server!.listen(0, "127.0.0.1", resolve),
        );
        const { port } = server.address() as AddressInfo;

        const thumb = path.join(dir, "clip.webp");
        await thumbnail.forVideo(`http://127.0.0.1:${port}/clip.mp4`, thumb, {
            width: 200,
            height: 200,
        });
        assert.equal(dimensions(thumb), "200,200");
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
        thumbnail.forVideo(video, path.join(dir, "local.webp"), {
            width: 10,
            height: 10,
        }),
    );
});
