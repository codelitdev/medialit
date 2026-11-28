#!/usr/bin/env bash
# Builds the transcription image with the small `tiny` model and checks that
# the real transcriber turns synthesized English speech into timed text
# (pipelines-phase-2.md, D3). The integration stack uses the fake
# transcriber; this is the check that the image and the script work.
#
#   bash packages/integration-tests/scripts/check-transcriber.sh
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
api_image="medialit-api:transcriber-check"
image="medialit-transcribe:transcriber-check"

echo "--- Building the API image and the transcription image (tiny model)"
docker build -q -f apps/api/Dockerfile -t "$api_image" . >/dev/null
docker build -q -f apps/transcribe/Dockerfile \
    --build-arg API_IMAGE="$api_image" \
    --build-arg MODEL_REPO=Systran/faster-whisper-tiny \
    --build-arg MODEL_REVISION=d90ca5fe260221311c53c58e660288d3deb8d356 \
    --build-arg MODEL_LABEL=faster-whisper/tiny \
    -t "$image" . >/dev/null

echo "--- Synthesizing speech"
text="The quick brown fox jumps over the lazy dog. Captions make videos easier to follow."
docker run --rm -v "$work:/out" debian:trixie-slim sh -ec "
    apt-get update -qq >/dev/null
    apt-get install -y -qq --no-install-recommends espeak-ng ffmpeg >/dev/null 2>&1
    espeak-ng -w /out/raw.wav '$text'
    # Silence on both sides, as real recordings have.
    ffmpeg -v error -f lavfi -t 2 -i anullsrc=r=22050:cl=mono -i /out/raw.wav \
        -f lavfi -t 2 -i anullsrc=r=22050:cl=mono \
        -filter_complex '[0][1][2]concat=n=3:v=0:a=1' -ac 1 -ar 16000 -c:a pcm_s16le /out/speech.wav
    chmod a+rw /out/speech.wav"

echo "--- Transcribing in the image"
chmod a+rwx "$work"
docker run --rm -v "$work:/work" --memory=3g "$image" sh -ec \
    '$TRANSCRIBE_PYTHON -I $TRANSCRIBE_SCRIPT --model $TRANSCRIBE_MODEL_DIR \
        --wav /work/speech.wav --out /work/out.json --threads 2'

python3 - "$work/out.json" <<'PY'
import json, sys
result = json.load(open(sys.argv[1]))
assert result["language"] == "en", result["language"]
text = " ".join(s["text"] for s in result["segments"]).lower()
# Stems, not exact words: the tiny model drops plurals ("caption make video").
for word in ["fox", "dog", "caption"]:
    assert word in text, f"{word!r} missing from {text!r}"
first = result["segments"][0]
assert first["start"] >= 1.0, f"the 2 s of silence should come first: {first}"
assert all(s["end"] >= s["start"] for s in result["segments"])
print("PASS transcriber:", text)
PY
