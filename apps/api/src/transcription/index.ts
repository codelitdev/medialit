/**
 * Who turns audio into timed text (pipelines-phase-2.md, D3). The captions
 * job depends only on `Transcriber`, so tests use the fake and another
 * engine can be added without changing the job.
 *
 * `fasterWhisper` runs `apps/transcribe/transcribe.py` as a child process,
 * the way the video jobs run ffmpeg: one run per job, killed when the job's
 * signal aborts. No address-space limit (`prlimit --as`): CTranslate2,
 * OpenMP and onnxruntime reserve far more than they use. The pod's memory
 * limit is the guard instead.
 */
import { availableParallelism } from "node:os";
import { readFile, rm, stat } from "node:fs/promises";
import { runLimited } from "@medialit/images";

export type TranscriptSegment = {
    /** Seconds from the start of the file. */
    start: number;
    end: number;
    text: string;
};

export type TranscribeResult = {
    /** ISO 639-1, as detected. */
    language: string;
    segments: TranscriptSegment[];
    /** How long loading the model took. */
    loadMs: number;
};

export type TranscribeInput = {
    /** 16 kHz mono 16-bit PCM. */
    wavPath: string;
    /** Where the transcriber may write its output. */
    outPath: string;
    timeoutMs: number;
    signal: AbortSignal;
};

export interface Transcriber {
    /** Recorded with the captions, e.g. `faster-whisper/large-v3-turbo-int8`. */
    model: string;
    transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

export type FasterWhisperConfig = {
    python: string;
    script: string;
    modelDir: string;
    model: string;
    threads: number;
};

/** The transcription image sets these (apps/transcribe/Dockerfile). */
export function fasterWhisperConfig(
    env: NodeJS.ProcessEnv = process.env,
): FasterWhisperConfig {
    const threads = Number(env.TRANSCRIBE_THREADS);
    return {
        python: env.TRANSCRIBE_PYTHON || "/opt/transcribe/venv/bin/python",
        script: env.TRANSCRIBE_SCRIPT || "/opt/transcribe/transcribe.py",
        modelDir: env.TRANSCRIBE_MODEL_DIR || "/opt/transcribe/model",
        model: env.TRANSCRIBE_MODEL || "faster-whisper/large-v3-turbo-int8",
        threads:
            Number.isInteger(threads) && threads > 0
                ? threads
                : availableParallelism(),
    };
}

export function fasterWhisper(
    config: FasterWhisperConfig = fasterWhisperConfig(),
): Transcriber {
    return {
        model: config.model,
        async transcribe(input) {
            await rm(input.outPath, { force: true });
            await runLimited(
                config.python,
                [
                    "-I",
                    config.script,
                    "--model",
                    config.modelDir,
                    "--wav",
                    input.wavPath,
                    "--out",
                    input.outPath,
                    "--threads",
                    String(config.threads),
                ],
                { timeoutMs: input.timeoutMs, signal: input.signal },
            );
            return parseResult(await readFile(input.outPath, "utf8"));
        },
    };
}

/** Checks the transcriber's output, so a broken run fails here rather than
 * as bad captions. */
export function parseResult(text: string): TranscribeResult {
    const value = JSON.parse(text) as Partial<TranscribeResult>;
    if (typeof value.language !== "string" || !Array.isArray(value.segments)) {
        throw new Error("The transcriber's output has no language or segments");
    }
    const segments = value.segments.map((segment) => {
        const { start, end, text: words } = segment as TranscriptSegment;
        if (
            typeof start !== "number" ||
            typeof end !== "number" ||
            typeof words !== "string" ||
            !(end >= start)
        ) {
            throw new Error("The transcriber returned a malformed segment");
        }
        return { start, end, text: words };
    });
    return {
        language: value.language,
        segments,
        loadMs: typeof value.loadMs === "number" ? value.loadMs : 0,
    };
}

/**
 * For tests and local development without the transcription image: one
 * numbered segment per 4 seconds of audio, in English. Reads the duration
 * from the WAV's size (16 kHz, mono, 16-bit, 44-byte header).
 */
export function fakeTranscriber(): Transcriber {
    return {
        model: "fake",
        async transcribe(input) {
            if (input.signal.aborted) throw new Error("aborted");
            const bytes = (await stat(input.wavPath)).size;
            const seconds = Math.max(0, (bytes - 44) / (16000 * 2));
            const segments: TranscriptSegment[] = [];
            for (let start = 0, n = 1; start < seconds; start += 4, n++) {
                segments.push({
                    start,
                    end: Math.min(seconds, start + 4),
                    text: `Segment ${n}.`,
                });
            }
            return { language: "en", segments, loadMs: 0 };
        },
    };
}

/** `TRANSCRIBER=fake` selects the fake, for the integration stack. */
export function transcriberFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): Transcriber {
    return env.TRANSCRIBER === "fake"
        ? fakeTranscriber()
        : fasterWhisper(fasterWhisperConfig(env));
}
