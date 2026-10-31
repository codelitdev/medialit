---
title: "Quick start"
description: "Upload your first file to MediaLit."
slug: quick-start
nav_order: 20
---

<Steps>
<Step>

### Create an app

Sign in to the [MediaLit dashboard](https://app.medialit.cloud) with your email and create an app. Each app has its own files, settings and [API keys](/docs/api-keys). Creating the app shows its first API key. Copy it now: MediaLit shows a key only once. You can create more keys in the app's settings.

<Callout type="warning">
  Anyone with the API key can upload, read and delete the app's files. Keep it on your server and out of browser code.
</Callout>

</Step>
<Step>

### Upload a file

Pick the way you want to work with MediaLit.

<Tabs items={["CLI", "cURL", "Node.js", "AI agent"]}>
<Tab value="CLI">

<CodeGroup>

```bash title="npm"
npm install -g @medialit/cli
```

```bash title="pnpm"
pnpm add -g @medialit/cli
```

```bash title="yarn"
yarn global add @medialit/cli
```

```bash title="bun"
bun add -g @medialit/cli
```

</CodeGroup>

```bash
medialit login
medialit upload photo.jpg --public
```

The CLI seals the file for you, so you can skip the next step. See [CLI](/docs/cli).

</Tab>
<Tab value="cURL">

```bash
curl -X POST https://api.medialit.cloud/media/create \
  -H "x-medialit-apikey: YOUR_API_KEY" \
  -F "file=@photo.jpg" \
  -F "access=public"
```

</Tab>
<Tab value="Node.js">

<CodeGroup>

```bash title="npm"
npm install medialit
```

```bash title="pnpm"
pnpm add medialit
```

```bash title="yarn"
yarn add medialit
```

```bash title="bun"
bun add medialit
```

</CodeGroup>

```ts
import { MediaLit } from "medialit";

const medialit = new MediaLit({ apiKey: process.env.MEDIALIT_API_KEY });
const media = await medialit.upload("./photo.jpg", { access: "public" });
```

</Tab>
<Tab value="AI agent">

Add `https://api.medialit.cloud/mcp` as a remote MCP server in Claude, ChatGPT, Cursor or another MCP client, sign in, and ask:

> Upload this image to MediaLit as a public file and give me its link.

See [MCP server](/docs/mcp-server) for client set-up.

</Tab>
</Tabs>

The response includes a `mediaId` and a `file` URL.

</Step>
<Step>

### Seal it

The upload is temporary, and MediaLit deletes it after 24 hours unless you seal it. Seal files once you know you want to keep them, for example when the user saves the form they were uploaded from.

<Tabs items={["cURL", "Node.js"]}>
<Tab value="cURL">

```bash
curl -X POST https://api.medialit.cloud/media/seal/MEDIA_ID \
  -H "x-medialit-apikey: YOUR_API_KEY"
```

</Tab>
<Tab value="Node.js">

```ts
const sealed = await medialit.seal(media.mediaId);
console.log(sealed.file);
```

</Tab>
</Tabs>

Sealed files appear in listings, in your storage total and in the dashboard. [Why uploads are temporary](/docs/concepts#temporary-uploads-and-sealing).

</Step>
</Steps>

## Next steps

<Cards>
  <Card title="Next.js" href="/docs/next-app-router" icon={<Code />}>
    Add a drop-in uploader to your app.
  </Card>
  <Card title="Other frameworks" href="/docs/other-frameworks" icon={<Code />}>
    Vue, Svelte or plain JavaScript in the browser.
  </Card>
  <Card title="Express" href="/docs/express-js" icon={<Server />}>
    Upload from a Node.js backend.
  </Card>
  <Card title="MCP server" href="/docs/mcp-server" icon={<Bot />}>
    Give AI agents a place to keep files.
  </Card>
  <Card title="REST API" href="/docs/api/upload-media" icon={<Terminal />}>
    Use MediaLit from any language.
  </Card>
</Cards>
