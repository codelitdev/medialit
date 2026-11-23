---
title: "Dashboard"
description: "Manage your apps and files from the browser."
slug: dashboard
nav_order: 10
---

The [MediaLit dashboard](https://app.medialit.cloud) is where you manage apps and look at your files. Sign in with your email address. MediaLit sends you a one-time code, so there is no password to remember.

## Apps

Create an app for each project or environment. An app's **App settings** has four tabs:

- **General**: rename the app, make it your default app, see how much storage it uses, and delete it.
- **API keys**: create and revoke the app's [API keys](/docs/api-keys).
- **Media**: **Image optimization** turns WebP conversion on and sets its quality (80 by default). **Video streaming** chooses what is made from sealed videos, [HLS or an MP4 for the web](/docs/concepts#video-streaming), and which HLS sizes, and shows the video processing minutes used this month. Each card saves on its own, and changes apply to files sealed afterwards.
- **Webhooks**: add the endpoints MediaLit calls when processing of a sealed file finishes or fails, send a test event, and see recent deliveries. See [Webhooks](/docs/webhooks).

## Files

Open an app to browse its files, whether your app, an agent or a script uploaded them. Click a file to preview it and copy its link. Videos play in the preview with the best version MediaLit made: HLS once it is ready, then the web MP4, then the original.

Only sealed files are listed. Files that are still [temporary](/docs/concepts#temporary-uploads-and-sealing) appear once they are sealed.

## Account

Your account page shows your plan and lets you manage billing.

## Work with files from your terminal

The [CLI](/docs/cli) signs in the same way and works on the same files: `medialit upload report.pdf --public` prints the file's link.

## Work with files through an AI assistant

To upload, organise or delete files by asking in plain language, connect Claude, ChatGPT or another assistant to the [MCP server](/docs/mcp-server). It works on the same files you see in the dashboard.
