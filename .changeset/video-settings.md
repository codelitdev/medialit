---
"@medialit/api": minor
"@medialit/web": minor
"medialit": minor
"@medialit/cli": minor
---

Two new media settings, `videoStreaming` (`off`, `hls` or `mp4`) and `hlsRenditions`, in the REST API, the MCP server, the SDK (`getSettings` and `updateSettings`), the new `medialit settings` command and the dashboard's new **Media processing** section. Apps that existed before keep `off`; new apps follow the plan (`hls` on self-hosted servers and the paid plan, `off` on the free plan). Storage stats in the API, MCP, SDK, CLI and dashboard now include the month's video processing minutes. `MCP_RATE_LIMIT_PER_MINUTE` sets the MCP server's per-client limit (60 by default). Videos aren't processed yet; that comes with the next releases.
