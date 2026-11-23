---
"@medialit/api": minor
"@medialit/web": minor
"medialit": minor
"@medialit/cli": minor
---

Thumbnail sizes are no longer a setting. Every app gets the standard thumbnails: 16:9 and at most 480 pixels tall for images, 720 pixels tall for videos. `thumbnailWidth` and `thumbnailHeight` are gone from the media settings in the REST API, the MCP server and the SDK's types; the API ignores them if a client still sends them. WebP quality now defaults to 80, so an app that turns WebP on without a quality no longer gets quality 0, and a quality must be from 1 to 100. App settings in the dashboard is now split into tabs (General, API keys, Media and Webhooks). The Media tab has two cards, Image optimization and Video streaming, each saved on its own, and the settings use switches and checkboxes from the design system.
