---
title: Frequently asked questions
slug: faqs
nav_order: 10
---

#### Is MediaLit just a wrapper around S3?

It stores files in S3-compatible storage, and adds what you would otherwise build around it: browser uploads without exposing keys, resumable uploads, automatic cleanup of unused uploads, public and private access, a list of your files with their details, thumbnails, quotas, an MCP server for agents, a dashboard and a CLI. See [Why MediaLit](/docs/what-is-medialit).

#### Why did my upload disappear?

Uploads through the API and MCP are temporary until you seal them, and unsealed uploads are deleted after 24 hours. Seal a file when your app decides to keep it. The CLI seals uploads for you unless you pass `--temp`. See [who seals](/docs/concepts#who-seals).

#### Why did my file's URL change?

Sealing a public file moves it to permanent public storage, which gives it a new URL. Store the URL that `seal` returns. Private files get a new signed URL each time you fetch them, so store the `mediaId` instead.

#### Can I upload from the browser without exposing my API key?

Yes. Your server creates a short-lived upload signature and the browser uploads with it. See [upload signatures](/docs/concepts#upload-signatures) and the [React uploader](/docs/react).

#### Can I upload from the terminal, a CI job or a coding agent?

Yes, with the [CLI](/docs/cli). Run `medialit login` on your machine, and you and any coding agent running there can use it. In CI, set `MEDIALIT_API_KEY` instead of logging in.

#### Which AI assistants work with MediaLit?

Any client that supports remote MCP servers, including Claude, ChatGPT, Cursor and VS Code. See [MCP server](/docs/mcp-server).

#### Can I use my own S3 or R2 bucket?

Yes, by [self-hosting](/docs/self-hosting) MediaLit. The hosted service at medialit.cloud stores files in MediaLit's own storage.

#### Is the open-source version limited?

No. Everything that runs [medialit.cloud](https://medialit.cloud) is in the [GitHub repository](https://github.com/codelitdev/medialit).
