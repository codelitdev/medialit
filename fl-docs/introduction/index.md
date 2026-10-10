---
title: MediaLit
slug: index
nav_order: 10
---

MediaLit stores files and gives you a URL for each one. Your app uploads through an API. AI agents connect over MCP or run the CLI. People use the dashboard or the same CLI. They all work on the same files.

- [For agents](/docs/mcp-server): Connect Claude, ChatGPT, Cursor or any MCP client, or let a coding agent run the CLI, to save and share files.
- [For apps](/docs/next-app-router): Add a drop-in uploader to a React app, or use the REST API from any backend.
- [For humans](/docs/dashboard): Browse, preview and share files from the dashboard, or upload from your terminal with the CLI.

## What you get

- **Uploads straight from the browser.** Your server hands out a short-lived signature, and the browser sends the file to MediaLit. Your API key never leaves your server, and large files resume after a dropped connection.
- **No orphaned files.** Uploads through the API and MCP are temporary until you seal them. If a user abandons a form, MediaLit deletes the file for you. [How this works](/docs/concepts#temporary-uploads-and-sealing).
- **Public and private files.** Public files get a permanent URL. Private files get a signed URL that expires.
- **Thumbnails and WebP.** MediaLit makes thumbnails for images and videos, and can convert images to WebP when they are uploaded.
- **Open source.** Use [medialit.cloud](https://medialit.cloud), or [run it yourself](/docs/self-hosting) on AWS S3, Cloudflare R2, MinIO or any S3-compatible storage.

## Start here

- [Quick start](/docs/quick-start): Upload your first file in a few minutes.
- [How MediaLit works](/docs/concepts): Apps, sealing, access and signatures.
