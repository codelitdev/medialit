# The transcription worker (pipelines-phase-2.md, D3): the API image plus
# Python, faster-whisper and the model. It runs the ordinary MediaLit worker
# for the `transcribe` job class only. Build from the repository root:
#
#   docker build -f apps/transcribe/Dockerfile \
#     --build-arg API_IMAGE=codelit/medialit:<tag> -t codelit/medialit-transcribe:<tag> .
#
# CI builds it with the API image of the same release tag, so the worker
# code always matches the API.
ARG API_IMAGE=codelit/medialit:latest
FROM ${API_IMAGE}

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY apps/transcribe/requirements.txt /opt/transcribe/requirements.txt
RUN python3 -m venv /opt/transcribe/venv \
    && /opt/transcribe/venv/bin/pip install --no-cache-dir \
        -r /opt/transcribe/requirements.txt

# The model is pinned to a revision and baked in. Override MODEL_REPO and
# MODEL_REVISION together, for example Systran/faster-whisper-tiny for a
# small image in tests.
ARG MODEL_REPO=dropbox-dash/faster-whisper-large-v3-turbo
ARG MODEL_REVISION=0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf
ARG MODEL_LABEL=faster-whisper/large-v3-turbo-int8
COPY apps/transcribe/download_model.py /opt/transcribe/download_model.py
RUN /opt/transcribe/venv/bin/python /opt/transcribe/download_model.py \
        "${MODEL_REPO}" "${MODEL_REVISION}" /opt/transcribe/model

COPY apps/transcribe/transcribe.py /opt/transcribe/transcribe.py

ENV TRANSCRIBE_PYTHON=/opt/transcribe/venv/bin/python \
    TRANSCRIBE_SCRIPT=/opt/transcribe/transcribe.py \
    TRANSCRIBE_MODEL_DIR=/opt/transcribe/model \
    TRANSCRIBE_MODEL=${MODEL_LABEL} \
    WORKER_CLASSES=transcribe \
    HF_HUB_OFFLINE=1

USER bun
CMD ["bun", "apps/api/src/worker.ts"]
