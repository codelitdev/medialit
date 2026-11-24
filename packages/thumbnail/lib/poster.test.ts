import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { findExecutable } from "@medialit/images";
import thumbnail, { posterSeekSeconds } from "./index";

const ffmpeg = findExecutable("ffmpeg");
const dir = mkdtempSync(path.join(tmpdir(), "poster-test-"));
let server: Server;
let base: string;

/** Serves `dir` with range support, as S3 would. */
function serve(): Promise<void> {
    server = createServer((req, res) => {
        const file = path.join(dir, path.basename(req.url ?? ""));
        const total = statSync(file).size;
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
        if (range) {
            const start = Number(range[1]);
            const end = range[2] ? Number(range[2]) : total - 1;
            res.writeHead(206, {
                "content-range": `bytes ${start}-${end}/${total}`,
                "content-length": end - start + 1,
                "accept-ranges": "bytes",
            });
            createReadStream(file, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                "content-length": total,
                "accept-ranges": "bytes",
            });
            createReadStream(file).pipe(res);
        }
    });
    return new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () => {
            base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
            resolve();
        }),
    );
}

/** Average luma of an image, 0-255, measured by ffmpeg. */
function yavg(file: string): number {
    const out = execFileSync(
        ffmpeg!,
        [
            "-v",
            "error",
            "-i",
            file,
            "-vf",
            "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
            "-f",
            "null",
            "-",
        ],
        { encoding: "utf8" },
    );
    return Number(/YAVG=([\d.]+)/.exec(out)?.[1]);
}

describe("posterSeekSeconds", () => {
    test("seeks 10% in, at most 10 s, and not at all for short videos", () => {
        assert.equal(posterSeekSeconds(undefined), 0);
        assert.equal(posterSeekSeconds(0.5), 0);
        assert.equal(posterSeekSeconds(20), 2);
        assert.equal(posterSeekSeconds(3600), 10);
    });
});

describe(
    "forVideoPoster",
    {
        skip: ffmpeg ? false : "ffmpeg is not installed",
    },
    () => {
        before(async () => {
            // 3 s of black, then 7 s of test pattern.
            execFileSync(ffmpeg!, [
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:size=320x180:rate=25:duration=3",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=320x180:rate=25:duration=7",
                "-filter_complex",
                "[0:v][1:v]concat=n=2:v=1:a=0",
                "-pix_fmt",
                "yuv420p",
                path.join(dir, "black-start.mp4"),
            ]);
            execFileSync(ffmpeg!, [
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:size=320x180:rate=25:duration=2",
                "-pix_fmt",
                "yuv420p",
                path.join(dir, "all-black.mp4"),
            ]);
            await serve();
        });
        after(() => server?.close());

        test("skips the black start and picks a frame with picture", async () => {
            const out = path.join(dir, "poster.webp");
            const result = await thumbnail.forVideoPoster(
                `${base}/black-start.mp4`,
                out,
                { seekSeconds: posterSeekSeconds(10) },
            );
            assert.equal(result.fallback, false);
            assert.ok(yavg(out) > 32, `poster luma ${yavg(out)}`);
        });

        test("falls back to the frame at the seek point when every frame is black", async () => {
            const out = path.join(dir, "black.webp");
            const result = await thumbnail.forVideoPoster(
                `${base}/all-black.mp4`,
                out,
                { seekSeconds: 0 },
            );
            assert.equal(result.fallback, true);
            assert.ok(statSync(out).size > 0);
        });
    },
);
