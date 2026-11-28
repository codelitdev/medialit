"""Downloads a pinned faster-whisper model into the image at build time
(pipelines-phase-2.md, D3), so pods never download anything.

    python download_model.py <repo> <revision> <directory>
"""
import sys

from huggingface_hub import snapshot_download

repo, revision, directory = sys.argv[1:4]
snapshot_download(
    repo_id=repo,
    revision=revision,
    local_dir=directory,
    allow_patterns=["*.json", "*.txt", "model.bin"],
)
print(f"{repo}@{revision} -> {directory}")
