import { test } from "node:test";
import assert from "node:assert/strict";
import { ProcessLimitError } from "@medialit/images";
import {
    captionsTimeoutMs,
    classify,
    extractAudioArgs,
    stealPercent,
} from "./captions.js";
import { planProcessing } from "./processing-plan.js";
import { JobError } from "../jobs/errors.js";

const video = {
    videoStreaming: "hls" as const,
    hlsRenditions: ["720p" as const],
};
const withAudio = {
    kind: "video" as const,
    durationSeconds: 60,
    audioCodec: "aac",
};

function types(input: Parameters<typeof planProcessing>[0]) {
    return planProcessing(input).map((job) => job.type);
}

test("seal plans captions for video with audio and for audio uploads", () => {
    const base = { video, plan: "basic" as const, generateCaptions: true };
    assert.deepEqual(
        types({ ...base, mimeType: "video/mp4", metadata: withAudio }),
        ["media.poster", "media.hls", "media.captions"],
    );
    // Unknown metadata: the job probes again.
    assert.deepEqual(
        types({ ...base, mimeType: "video/mp4", metadata: null }),
        ["media.poster", "media.hls", "media.captions"],
    );
    // Audio known absent.
    assert.deepEqual(
        types({
            ...base,
            mimeType: "video/mp4",
            metadata: { kind: "video", durationSeconds: 60 },
        }),
        ["media.poster", "media.hls"],
    );
    const audio = planProcessing({
        ...base,
        mimeType: "audio/mpeg",
        metadata: { kind: "audio", durationSeconds: 30, audioCodec: "mp3" },
    });
    assert.deepEqual(
        audio.map((j) => [j.type, j.derivative]),
        [["media.captions", "captions"]],
    );
    assert.deepEqual(audio[0].params, {
        source: "audio_upload",
        durationSeconds: 30,
    });
    // A video type that is audio only.
    assert.deepEqual(
        types({
            ...base,
            mimeType: "video/mp4",
            metadata: { kind: "audio", audioCodec: "aac" },
        }),
        ["media.captions"],
    );
    assert.deepEqual(
        types({ ...base, mimeType: "image/png", metadata: null }),
        [],
    );
});

test("captions off plans as phase 1", () => {
    const base = { video, plan: "basic" as const, generateCaptions: false };
    assert.deepEqual(
        types({ ...base, mimeType: "video/mp4", metadata: withAudio }),
        ["media.poster", "media.hls"],
    );
    assert.deepEqual(
        types({ ...base, mimeType: "audio/wav", metadata: null }),
        [],
    );
});

test("captions time out at three times the audio, at least 15 minutes", () => {
    assert.equal(captionsTimeoutMs(60), 15 * 60 * 1000);
    assert.equal(captionsTimeoutMs(3600), 3 * 3600 * 1000);
});

test("extraction takes the first audio stream as 16 kHz mono PCM", () => {
    const args = extractAudioArgs({
        source: "/w/source",
        output: "/w/audio.wav",
        maxDurationSeconds: 7200,
    });
    const joined = args.join(" ");
    assert.match(joined, /-protocol_whitelist file -i \/w\/source/);
    assert.match(joined, /-map 0:a:0 -vn/);
    assert.match(
        joined,
        /-ac 1 -ar 16000 -c:a pcm_s16le -t 7200 -f wav \/w\/audio\.wav$/,
    );
});

test("CPU steal is the stolen share between two readings", () => {
    assert.equal(
        stealPercent({ steal: 10, total: 1000 }, { steal: 60, total: 2000 }),
        5,
    );
    assert.equal(stealPercent(null, { steal: 1, total: 2 }), undefined);
    assert.equal(
        stealPercent({ steal: 1, total: 2 }, { steal: 1, total: 2 }),
        undefined,
    );
});

test("retry rules: limits and timeouts are final, crashes are retried", () => {
    const signal = new AbortController().signal;
    const limit = new JobError("x", {
        reason: "no_audio_stream",
        retryable: false,
    });
    assert.equal(classify(limit, signal), limit);
    const timeout = classify(new ProcessLimitError("t", "timeout"), signal);
    assert.deepEqual([timeout.reason, timeout.retryable], ["timeout", false]);
    const storage = classify(new Error("S3 down"), signal);
    assert.deepEqual([storage.reason, storage.retryable], ["storage", true]);
});
