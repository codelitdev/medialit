import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import thumbnail from "@medialit/thumbnail";

test("forVideo does not run shell syntax found in the source path", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "thumb-shell-"));
    const marker = path.join(dir, "PWNED");
    try {
        for (const source of [
            path.join(dir, `main.mp4$(touch ${marker})`),
            path.join(dir, `main.mp4"; touch ${marker}; echo "`),
            path.join(dir, `main.mp4\`touch ${marker}\``),
        ]) {
            // The file does not exist, so ffmpeg fails; that is fine.
            await assert.rejects(
                thumbnail.forVideo(source, path.join(dir, "thumb.webp")),
            );
        }
        assert.equal(existsSync(marker), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
