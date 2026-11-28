import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
    fakeTranscriber,
    fasterWhisper,
    fasterWhisperConfig,
    parseResult,
} from "./index.js";

const dir = mkdtempSync(path.join(tmpdir(), "transcription-test-"));

describe("transcription", () => {
    test("parseResult accepts the script's output and refuses broken output", () => {
        assert.deepEqual(
            parseResult(
                JSON.stringify({
                    language: "en",
                    segments: [{ start: 0, end: 1.5, text: "Hello." }],
                    loadMs: 12,
                }),
            ),
            {
                language: "en",
                segments: [{ start: 0, end: 1.5, text: "Hello." }],
                loadMs: 12,
            },
        );
        assert.throws(() => parseResult("{}"), /no language or segments/);
        assert.throws(
            () =>
                parseResult(
                    JSON.stringify({
                        language: "en",
                        segments: [{ start: 2, end: 1, text: "x" }],
                    }),
                ),
            /malformed segment/,
        );
        assert.throws(() => parseResult("not json"));
    });

    test("the fake makes one segment per 4 seconds of a 16 kHz mono WAV", async () => {
        const wav = path.join(dir, "ten-seconds.wav");
        writeFileSync(wav, Buffer.alloc(44 + 10 * 16000 * 2));
        const result = await fakeTranscriber().transcribe({
            wavPath: wav,
            outPath: path.join(dir, "out.json"),
            timeoutMs: 1000,
            signal: new AbortController().signal,
        });
        assert.equal(result.language, "en");
        assert.deepEqual(
            result.segments.map((s) => [s.start, s.end]),
            [
                [0, 4],
                [4, 8],
                [8, 10],
            ],
        );
    });

    test("config comes from the transcription image's environment", () => {
        const config = fasterWhisperConfig({
            TRANSCRIBE_PYTHON: "/p",
            TRANSCRIBE_SCRIPT: "/s.py",
            TRANSCRIBE_MODEL_DIR: "/m",
            TRANSCRIBE_MODEL: "faster-whisper/tiny",
            TRANSCRIBE_THREADS: "2",
        });
        assert.deepEqual(config, {
            python: "/p",
            script: "/s.py",
            modelDir: "/m",
            model: "faster-whisper/tiny",
            threads: 2,
        });
        assert.ok(fasterWhisperConfig({}).threads >= 1);
    });

    test("fasterWhisper runs the script with its arguments and reads what it wrote", async () => {
        // A stand-in for Python: records its arguments in the result it
        // writes to --out, as the real script writes its transcript.
        const python = path.join(dir, "python");
        writeFileSync(
            python,
            [
                "#!/bin/sh",
                'args="$*"',
                'while [ "$1" != "--out" ]; do shift; done',
                `printf '{"language":"es","loadMs":5,"segments":[{"start":0,"end":2,"text":"%s"}]}' "$args" > "$2"`,
            ].join("\n"),
            { mode: 0o755 },
        );
        const outPath = path.join(dir, "result.json");
        const result = await fasterWhisper({
            python,
            script: "/opt/transcribe/transcribe.py",
            modelDir: "/models/x",
            model: "test",
            threads: 3,
        }).transcribe({
            wavPath: "/in.wav",
            outPath,
            timeoutMs: 10_000,
            signal: new AbortController().signal,
        });
        assert.equal(result.language, "es");
        assert.equal(
            result.segments[0].text,
            `-I /opt/transcribe/transcribe.py --model /models/x --wav /in.wav --out ${outPath} --threads 3`,
        );
    });
});
