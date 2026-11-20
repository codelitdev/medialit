---
"@medialit/api": minor
---

Background jobs now run in a separate worker process, started from the same image with `bun apps/api/src/worker.ts`. Cleanup of expired and unfinished uploads moves from the API to the worker and runs once per installation. Self-hosted installs must add the worker service before upgrading; see the upgrade guide.
