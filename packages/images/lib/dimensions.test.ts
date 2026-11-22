import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { readImageInfoFromBuffer, readImageInfoFromFile } from "./dimensions";
import { makePng } from "./test-helpers";

const dirs: string[] = [];
after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("reads PNG dimensions from the header", async () => {
    assert.deepEqual(await readImageInfoFromBuffer(makePng(7, 3)), {
        format: "png",
        width: 7,
        height: 3,
    });
});

test("reads a huge declared PNG size without its pixel data", async () => {
    const bomb = makePng(30_000, 30_000, 1);
    assert.ok(bomb.length < 2000, "the fixture stays small");
    const dir = await mkdtemp(path.join(os.tmpdir(), "images-dim-"));
    dirs.push(dir);
    const file = path.join(dir, "bomb.png");
    await writeFile(file, bomb);
    assert.deepEqual(await readImageInfoFromFile(file), {
        format: "png",
        width: 30_000,
        height: 30_000,
    });
});

test("reads JPEG dimensions past other segments", async () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
    const app1 = Buffer.concat([
        Buffer.from([0xff, 0xe1, 0x10, 0x02]),
        Buffer.alloc(0x1000),
    ]);
    const sof = Buffer.from([
        0xff,
        0xc2,
        0x00,
        0x11,
        0x08,
        0x01,
        0x2c,
        0x02,
        0x58,
        0x03,
        ...Buffer.alloc(9),
    ]);
    const jpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        app0,
        app1,
        Buffer.from([0xff]),
        sof,
    ]);
    assert.deepEqual(await readImageInfoFromBuffer(jpeg), {
        format: "jpeg",
        width: 600,
        height: 300,
    });
});

test("reads WebP and GIF dimensions", async () => {
    const vp8x = Buffer.alloc(32);
    vp8x.write("RIFF", 0, "ascii");
    vp8x.write("WEBP", 8, "ascii");
    vp8x.write("VP8X", 12, "ascii");
    vp8x.writeUIntLE(4999, 24, 3);
    vp8x.writeUIntLE(1999, 27, 3);
    assert.deepEqual(await readImageInfoFromBuffer(vp8x), {
        format: "webp",
        width: 5000,
        height: 2000,
    });

    const gif = Buffer.alloc(16);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(240, 8);
    assert.deepEqual(await readImageInfoFromBuffer(gif), {
        format: "gif",
        width: 320,
        height: 240,
    });
});

test("returns null for bytes that aren't a supported image", async () => {
    assert.equal(
        await readImageInfoFromBuffer(
            Buffer.from("not an image at all, just text"),
        ),
        null,
    );
    assert.equal(
        await readImageInfoFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xda])),
        null,
    );
    assert.equal(
        await readImageInfoFromBuffer(makePng(4, 4).subarray(0, 20)),
        null,
    );
});
