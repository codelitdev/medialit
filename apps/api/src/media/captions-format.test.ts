import { test } from "node:test";
import assert from "node:assert/strict";
import {
    MAX_CUE_LINES,
    MAX_CUE_SECONDS,
    MAX_LINE_CHARS,
    buildCues,
    cleanSegments,
    toTranscriptJson,
    toTranscriptText,
    toVtt,
    vttTime,
    wrap,
} from "./captions-format.js";

test("WebVTT times, including past an hour", () => {
    assert.equal(vttTime(0), "00:00:00.000");
    assert.equal(vttTime(1.2345), "00:00:01.235");
    assert.equal(vttTime(3725.5), "01:02:05.500");
    assert.equal(vttTime(-1), "00:00:00.000");
});

test("cleaning drops empty segments and loops, and removes overlap", () => {
    const cleaned = cleanSegments([
        { start: 0, end: 2, text: " Hello  there. " },
        { start: 1.5, end: 3, text: "♪" },
        { start: 1.8, end: 4, text: "Again." },
        { start: 4, end: 5, text: "again" },
        { start: 5, end: 6, text: "Again!" },
        { start: 6, end: 7, text: "Again." },
        { start: 7, end: 8, text: "Done." },
    ]);
    assert.deepEqual(
        cleaned.map((s) => s.text),
        ["Hello there.", "Again.", "again", "Done."],
    );
    // Starts no earlier than the previous end.
    assert.equal(cleaned[1].start, 2);
});

test("lines wrap at 42 characters; a long word gets its own line", () => {
    const lines = wrap(
        "the quick brown fox jumps over the lazy dog again and again".split(
            " ",
        ),
    );
    assert.ok(lines.every((line) => line.length <= MAX_LINE_CHARS));
    assert.equal(
        lines.join(" "),
        "the quick brown fox jumps over the lazy dog again and again",
    );
    assert.deepEqual(wrap(["x".repeat(50), "y"]), ["x".repeat(50), "y"]);
});

test("cues fit two lines and seven seconds, and cover the segment", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const cues = buildCues([{ start: 10, end: 40, text }]);
    assert.ok(cues.length > 1);
    for (const cue of cues) {
        assert.ok(cue.lines.length <= MAX_CUE_LINES);
        assert.ok(cue.lines.every((l) => l.length <= MAX_LINE_CHARS));
        assert.ok(
            cue.end - cue.start <= MAX_CUE_SECONDS + 0.5,
            `${cue.end - cue.start}`,
        );
        assert.ok(cue.end >= cue.start);
    }
    assert.equal(cues[0].start, 10);
    assert.equal(cues[cues.length - 1].end, 40);
    for (let i = 1; i < cues.length; i++) {
        assert.ok(cues[i].start >= cues[i - 1].start);
    }
    assert.equal(cues.flatMap((c) => c.lines).join(" "), text);
});

test("the VTT escapes markup and numbers its cues", () => {
    const vtt = toVtt(buildCues([{ start: 0, end: 2, text: "a < b & c > d" }]));
    assert.equal(
        vtt,
        "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\na &lt; b &amp; c &gt; d\n",
    );
});

test("the transcript starts a paragraph after a pause of 2 s", () => {
    assert.equal(
        toTranscriptText([
            { start: 0, end: 1, text: "One." },
            { start: 1.5, end: 2, text: "Two." },
            { start: 4, end: 5, text: "Three." },
        ]),
        "One. Two.\n\nThree.\n",
    );
});

test("the JSON transcript is version 1 with segment ids", () => {
    const json = JSON.parse(
        toTranscriptJson({
            language: "en",
            durationSeconds: 12.34567,
            model: "fake",
            segments: [{ start: 0, end: 1, text: "Hi." }],
        }),
    );
    assert.deepEqual(json, {
        version: 1,
        language: "en",
        durationSeconds: 12.346,
        model: "fake",
        segments: [{ id: 0, start: 0, end: 1, text: "Hi." }],
    });
});
