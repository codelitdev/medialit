import { test } from "node:test";
import assert from "node:assert/strict";
import generateFileName from "../generate-file-name.js";

test("keeps a plain alphanumeric extension", () => {
    assert.equal(generateFileName("photo.PNG").ext, "PNG");
    assert.equal(generateFileName("a.b.mp4").ext, "mp4");
});

test("falls back to bin for extensions that are not safe in paths or shells", () => {
    for (const name of [
        "x.mp4$(touch /tmp/pwn)",
        'x.mp4"; touch /tmp/pwn; echo "',
        "x.mp4`id`",
        "x.mp4;id",
        "x.mp4 && id",
        "x.../../etc",
        "x.",
        "x.abcdefghijk",
        "noextension",
        "",
    ]) {
        assert.equal(generateFileName(name).ext, "bin", name);
    }
});

test("always generates a fresh media id", () => {
    assert.notEqual(
        generateFileName("a.png").name,
        generateFileName("a.png").name,
    );
});
