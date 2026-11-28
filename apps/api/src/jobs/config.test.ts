import assert from "node:assert/strict";
import { test } from "node:test";
import { workerConfig } from "./config.js";

test("workers serve cpu, io and video unless WORKER_CLASSES lists transcribe", () => {
    assert.deepEqual(workerConfig({}).classes, ["cpu", "io", "video"]);
    assert.deepEqual(workerConfig({ WORKER_CLASSES: "transcribe" }).classes, [
        "transcribe",
    ]);
    assert.throws(
        () => workerConfig({ WORKER_CLASSES: "captions" }),
        /cpu, io, video, transcribe/,
    );
});

test("one transcription at a time unless WORKER_CONCURRENCY_TRANSCRIBE says otherwise", () => {
    assert.equal(workerConfig({}).concurrency.transcribe, 1);
    assert.equal(
        workerConfig({ WORKER_CONCURRENCY_TRANSCRIBE: "2" }).concurrency
            .transcribe,
        2,
    );
});
