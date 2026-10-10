---
title: Quick start
slug: quick-start
nav_order: 20
---

### Create an app

Sign in to the [MediaLit dashboard](https://app.medialit.cloud) with your email and create an app. Each app has its own files, settings and API key. Copy the API key from the app's settings.

> **Warning:** Anyone with the API key can upload, read and delete the app's files. Keep it on your server and out of browser code.
### Upload a file

Pick the way you want to work with MediaLit.

#### CLI
```bash
npm install -g @medialit/cli
```

```bash
medialit login
medialit upload photo.jpg --public
```

The CLI seals the file for you, so you can skip the next step. See [CLI](/docs/cli).
#### cURL
```bash
curl -X POST https://api.medialit.cloud/media/create \
  -H "x-medialit-apikey: YOUR_API_KEY" \
  -F "file=@photo.jpg" \
  -F "access=public"
```
#### Node.js
```bash
npm install medialit
```

```ts
const medialit = new MediaLit({ apiKey: process.env.MEDIALIT_API_KEY });
const media = await medialit.upload("./photo.jpg", { access: "public" });
```
#### AI agent
Add `https://api.medialit.cloud/mcp` as a remote MCP server in Claude, ChatGPT, Cursor or another MCP client, sign in, and ask:

> Upload this image to MediaLit as a public file and give me its link.

See [MCP server](/docs/mcp-server) for client set-up.
The response includes a `mediaId` and a `file` URL.
### Seal it

The upload is temporary, and MediaLit deletes it after 24 hours unless you seal it. Seal files once you know you want to keep them, for example when the user saves the form they were uploaded from.

#### cURL
```bash
curl -X POST https://api.medialit.cloud/media/seal/MEDIA_ID \
  -H "x-medialit-apikey: YOUR_API_KEY"
```
#### Node.js
```ts
const sealed = await medialit.seal(media.mediaId);
console.log(sealed.file);
```
Sealed files appear in listings, in your storage total and in the dashboard. [Why uploads are temporary](/docs/concepts#temporary-uploads-and-sealing).

## Next steps

- [Next.js](/docs/next-app-router): Add a drop-in uploader to your app.
- [Other frameworks](/docs/other-frameworks): Vue, Svelte or plain JavaScript in the browser.
- [Express](/docs/express-js): Upload from a Node.js backend.
- [MCP server](/docs/mcp-server): Give AI agents a place to keep files.
- [REST API](https://medialit.cloud/docs/api/uploadMedia): Use MediaLit from any language.
