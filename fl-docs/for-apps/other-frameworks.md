---
title: Other frameworks
slug: other-frameworks
nav_order: 30
---

`@medialit/uploader` uploads a file from the browser to MediaLit and has no framework dependency. [`@medialit/react`](/docs/react) is built on it.

```bash
npm install @medialit/uploader
```

Your server needs a route that returns `{ signature, endpoint }`. Use [`createSignatureHandler`](/docs/node-sdk#createsignaturehandler) with any server that uses the Fetch API, or see [Express](/docs/express-js#let-browsers-upload).

## Upload a file

```ts
const media = await uploadFile(file, {
    signatureEndpoint: "/api/medialit/signature",
    access: "public",
    onProgress: ({ percentage }) => console.log(`${Math.round(percentage)}%`),
});

console.log(media.mediaId, media.file);
```

`uploadFile` resolves to the [uploaded media](/docs/react#uploadedmedia) and rejects with an error whose `message` you can show to the user. Errors from MediaLit or your signature route are `MediaLitUploadError`s with the HTTP `status`. Send `media.mediaId` to your server and seal it there when the user saves.

## Cancel an upload

Pass an `AbortSignal`. Cancelling rejects with an `UploadAbortedError`.

```ts
const controller = new AbortController();
cancelButton.onclick = () => controller.abort();

try {
    await uploadFile(file, {
        signatureEndpoint: "/api/medialit/signature",
        signal: controller.signal,
    });
} catch (err) {
    if (!isUploadAbortedError(err)) showError(err.message);
}
```

## Examples

#### Plain JavaScript
With a bundler such as Vite:

```html
<input type="file" id="file" />
<progress id="progress" max="100" value="0"></progress>

<script type="module">
    import { uploadFile } from "@medialit/uploader";

    document.getElementById("file").addEventListener("change", async (e) => {
        const media = await uploadFile(e.target.files[0], {
            signatureEndpoint: "/api/medialit/signature",
            onProgress: ({ percentage }) => {
                document.getElementById("progress").value = percentage;
            },
        });
        console.log(media.mediaId);
    });
</script>
```
#### Vue
```vue
<script setup lang="ts">

const progress = ref(0);
const error = ref("");

async function onChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
        const media = await uploadFile(file, {
            signatureEndpoint: "/api/medialit/signature",
            onProgress: (p) => (progress.value = p.percentage),
        });
        console.log(media.mediaId);
    } catch (err) {
        error.value = (err as Error).message;
    }
}
</script>

<template>
    <input type="file" @change="onChange" />
    <progress max="100" :value="progress" />
    <p v-if="error">{{ error }}</p>
</template>
```
#### Svelte
```svelte
<script lang="ts">
    import { uploadFile } from "@medialit/uploader";

    let progress = $state(0);
    let error = $state("");

    async function onchange(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
            const media = await uploadFile(file, {
                signatureEndpoint: "/api/medialit/signature",
                onProgress: (p) => (progress = p.percentage),
            });
            console.log(media.mediaId);
        } catch (err) {
            error = (err as Error).message;
        }
    }
</script>

<input type="file" {onchange} />
<progress max="100" value={progress}></progress>
{#if error}<p>{error}</p>{/if}
```
## Options

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `signatureEndpoint` | string |  |  | Your route that returns `{ signature, endpoint }`. It is called with POST and the browser's cookies. |
| `getSignature` | `() => Promise<{ signature: string; endpoint: string }>` |  |  | Use instead of `signatureEndpoint` to fetch the signature yourself. |
| `access` | `"public" or "private"` |  | `"private"` |  |
| `caption` | string |  |  |  |
| `fileName` | string |  |  | Required for a Blob that is not a File. |
| `chunkSize` | number |  |  | Bytes per request. By default the file is sent in one request. |
| `retryDelays` | `number[]` |  | `[0, 3000, 5000, 10000]` | Milliseconds to wait before each retry. |
| `resume` | boolean |  | `true` | Continue an interrupted upload of the same file. |
| `signal` | `AbortSignal` |  |  | Cancels the upload. |
| `onProgress` | `({ bytesUploaded, bytesTotal, percentage }) => void` |  |  |  |
