# @medialit/react

A drop-in upload component and hook for [MediaLit](https://medialit.cloud). Files go straight from the browser to MediaLit over the resumable tus protocol, so your API key stays on your server.

## Install

```bash
npm install @medialit/react medialit
```

## 1. Add a signature route

The browser needs a short-lived upload signature from your backend. With Next.js:

```ts
// app/api/medialit/signature/route.ts
import { createSignatureHandler } from "medialit";
import { getSession } from "@/lib/auth"; // your app's auth

export const POST = createSignatureHandler({
    // Reads MEDIALIT_API_KEY and MEDIALIT_ENDPOINT from the environment.
    // Anyone who passes this check can upload to your MediaLit app.
    authorize: async (request) => !!(await getSession(request)),
});
```

Return `{ group: "..." }` from `authorize` to put the files in a group.

## 2. Render the uploader

```tsx
"use client";

import { MediaLitUploader } from "@medialit/react";
import "@medialit/react/styles.css";

export function AvatarUpload() {
    return (
        <MediaLitUploader
            signatureEndpoint="/api/medialit/signature"
            access="public"
            accept="image/*"
            maxFileSize={5 * 1024 * 1024}
            onUploadComplete={(media) => saveAvatar(media.mediaId)}
        />
    );
}
```

## 3. Seal the upload

Uploads are temporary and MediaLit deletes them after a while unless they are sealed. Seal on your server when the user saves, so files from abandoned forms are cleaned up for you:

```ts
import { MediaLit } from "medialit";

await new MediaLit().seal(mediaId);
```

## Props

| Prop                | Type                                     | Description                                              |
| ------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `signatureEndpoint` | `string`                                 | Your route that returns `{ signature, endpoint }`.       |
| `getSignature`      | `() => Promise<{ signature, endpoint }>` | Use instead of `signatureEndpoint` to fetch it yourself. |
| `access`            | `"public" \| "private"`                  | Defaults to `private`.                                   |
| `caption`           | `string`                                 | Stored with the file.                                    |
| `accept`            | `string`                                 | Same format as `<input accept>`. Also checked for drops. |
| `maxFileSize`       | `number`                                 | Bytes. MediaLit enforces your plan's limit as well.      |
| `chunkSize`         | `number`                                 | Bytes per request. Defaults to one request.              |
| `onUploadComplete`  | `(media) => void`                        | Called with the uploaded media.                          |
| `onUploadError`     | `(error) => void`                        | Called with a `MediaLitUploadError`.                     |
| `labels`            | `Partial<MediaLitUploaderLabels>`        | Replace any text, for example to translate it.           |
| `disabled`          | `boolean`                                |                                                          |
| `className`         | `string`                                 | Added to the root element.                               |

## Styling

`styles.css` is optional. It styles the `.medialit-uploader` classes and follows the system's light or dark mode. Override its variables to match your app:

```css
.medialit-uploader {
    --medialit-accent: #0f766e;
    --medialit-radius: 6px;
}
```

The root element has `data-status` set to `idle`, `uploading`, `success`, or `error`.

## Build your own UI

`useMediaLitUpload` has the same upload logic without any markup:

```tsx
import { useMediaLitUpload } from "@medialit/react";

function UploadButton() {
    const { upload, cancel, status, progress, error } = useMediaLitUpload({
        signatureEndpoint: "/api/medialit/signature",
    });

    if (status === "uploading") {
        return (
            <button onClick={cancel}>Cancel ({Math.round(progress)}%)</button>
        );
    }
    return (
        <>
            <input
                type="file"
                onChange={(e) =>
                    e.target.files?.[0] && upload(e.target.files[0])
                }
            />
            {error && <p>{error.message}</p>}
        </>
    );
}
```

`upload(file)` resolves to the media, or `null` if the upload failed or was cancelled. It never rejects.

For a framework other than React, use [`@medialit/uploader`](../uploader).
