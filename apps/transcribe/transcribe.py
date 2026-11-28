"""Transcribes one 16 kHz mono WAV with faster-whisper and writes the result
as JSON (pipelines-phase-2.md, D3). The worker runs it as a child process,
like ffmpeg: one run per captions job, so the model's memory is freed when
the job ends.

    python transcribe.py --model DIR --wav FILE --out FILE [--threads N]

Writes {"language", "segments": [{"start", "end", "text"}], "loadMs"} to
--out. Times are seconds from the start of the file. Exits non-zero, with
the reason on stderr, when it can't.
"""
import argparse
import json
import os
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="model directory")
    parser.add_argument("--wav", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--threads", type=int, default=os.cpu_count() or 1)
    parser.add_argument("--beam-size", type=int, default=5)
    args = parser.parse_args()

    # Imported here so --help works without the dependencies.
    import soundfile
    from faster_whisper import WhisperModel

    started = time.monotonic()
    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        cpu_threads=args.threads,
    )
    load_ms = round((time.monotonic() - started) * 1000)

    # Decoded here rather than by faster-whisper: its own decoder breaks
    # with some PyAV versions, and the worker already made a 16 kHz mono WAV.
    audio, rate = soundfile.read(args.wav, dtype="float32")
    if rate != 16000 or audio.ndim != 1:
        print(f"expected 16 kHz mono, got {rate} Hz, {audio.ndim} dims", file=sys.stderr)
        return 2

    segments, info = model.transcribe(
        audio,
        beam_size=args.beam_size,
        # Whisper invents text in music and silence without it (D4).
        vad_filter=True,
        # Each window sees the text before it. Without it, large-v3-turbo
        # drops punctuation and capitals for minutes at a time (60% of a
        # 10-minute talk in testing). faster-whisper drops that context when
        # a window falls back to a higher temperature, which breaks repetition
        # loops, and captions-format.ts removes any repeats that get through.
        condition_on_previous_text=True,
    )
    result = {
        "language": info.language,
        "segments": [
            {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
            for s in segments
        ],
        "loadMs": load_ms,
    }
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as out:
        json.dump(result, out, ensure_ascii=False)
    os.replace(tmp, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
