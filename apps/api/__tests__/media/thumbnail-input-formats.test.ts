import { after, before, describe, test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import thumbnail from "@medialit/thumbnail";

// ffmpeg isn't installed everywhere `bun run test` runs.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function makeSample(args: string[], output: string) {
    const result = spawnSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=352x288:rate=25",
        ...args,
        output,
    ]);
    assert.strictEqual(result.status, 0, result.stderr?.toString());
}

function listen(server: http.Server) {
    return new Promise<string>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as AddressInfo;
            resolve(`http://127.0.0.1:${port}`);
        });
    });
}

describe("thumbnail input formats", { skip: !hasFfmpeg }, () => {
    let dir: string;
    let storage: http.Server;
    let internal: http.Server;
    let storageUrl: string;
    let internalUrl: string;
    const internalHits: string[] = [];

    before(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), "medialit-thumb-test-"));
        makeSample(["-t", "1", "-pix_fmt", "yuv420p"], `${dir}/main.mp4`);
        makeSample(["-t", "1"], `${dir}/main.webm`);
        // The API stores downloaded images as `source`, with no extension.
        makeSample(
            ["-frames:v", "1", "-f", "image2", "-c:v", "png"],
            `${dir}/source`,
        );

        internal = http.createServer((req, res) => {
            internalHits.push(req.url ?? "");
            res.end("internal");
        });
        internalUrl = await listen(internal);

        // Serves files the way S3 serves presigned URLs: the declared
        // content type, whatever the bytes are.
        await writeFile(
            `${dir}/main.m3u8`,
            [
                "#EXTM3U",
                "#EXT-X-MEDIA-SEQUENCE:0",
                "#EXTINF:1.0,",
                `${internalUrl}/secret.ts`,
                "#EXT-X-ENDLIST",
                "",
            ].join("\n"),
        );
        storage = http.createServer(async (req, res) => {
            const name = path.basename(
                new URL(req.url ?? "", storageUrl).pathname,
            );
            try {
                const body = await readFile(path.join(dir, name));
                res.writeHead(200, { "Content-Type": "video/mp4" });
                res.end(body);
            } catch {
                res.writeHead(404);
                res.end();
            }
        });
        storageUrl = await listen(storage);
    });

    after(async () => {
        storage?.close();
        internal?.close();
        if (dir) await rm(dir, { recursive: true, force: true });
    });

    test("a playlist uploaded as a video fetches nothing and gets no thumbnail", async () => {
        const destination = `${dir}/thumb-playlist.webp`;
        await assert.rejects(
            thumbnail.forVideo(
                `${storageUrl}/main.m3u8?X-Amz-Signature=test`,
                destination,
            ),
        );
        assert.deepStrictEqual(internalHits, []);
        await assert.rejects(stat(destination));
    });

    for (const file of ["main.mp4", "main.webm"]) {
        test(`a real video (${file}) still gets a thumbnail`, async () => {
            const destination = `${dir}/thumb-${file}.webp`;
            await thumbnail.forVideo(
                `${storageUrl}/${file}?X-Amz-Signature=test`,
                destination,
            );
            assert.ok((await stat(destination)).size > 0);
        });
    }

    test("an image still gets a thumbnail", async () => {
        const destination = `${dir}/thumb-image.webp`;
        await thumbnail.forImage(`${dir}/source`, destination);
        assert.ok((await stat(destination)).size > 0);
    });

    test("a playlist uploaded as an image gets no thumbnail", async () => {
        const source = `${dir}/image-playlist`;
        await writeFile(source, await readFile(`${dir}/main.m3u8`));
        await assert.rejects(
            thumbnail.forImage(source, `${dir}/thumb-image-playlist.webp`),
        );
        assert.deepStrictEqual(internalHits, []);
    });
});
