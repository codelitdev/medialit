---
title: React
slug: react
nav_order: 20
---

`@medialit/react` uploads files from the browser directly to MediaLit with resumable uploads. It works with any React 18 or 19 app, including Next.js, Remix and Vite.

```bash
npm install @medialit/react
```

Your server needs a route that returns an upload signature. See [Next.js](/docs/next-app-router#create-the-signature-route) or [`createSignatureHandler`](/docs/node-sdk#createsignaturehandler).

## MediaLitUploader

A drop zone with upload progress, cancel, retry and a preview of the uploaded file.

```tsx
"use client";

export function Upload() {
    return (
        <MediaLitUploader
            signatureEndpoint="/api/medialit/signature"
            onUploadComplete={(media) => console.log(media.mediaId)}
        />
    );
}
```

### Props

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `signatureEndpoint` | string |  |  | Your route that returns `{ signature, endpoint }`. It is called with POST and the browser's cookies. |
| `getSignature` | `() => Promise<{ signature: string; endpoint: string }>` |  |  | Use instead of `signatureEndpoint` when you need to fetch the signature yourself, for example with an Authorization header. |
| `access` | `"public" or "private"` |  | `"private"` | Who can open the file once it is sealed. |
| `caption` | string |  |  | Stored with the file. |
| `accept` | string |  |  | File types to allow, in the format of `<input accept>`, such as `"image/*,.pdf"`. Also checked for dropped files. |
| `maxFileSize` | number |  |  | Largest file in bytes. MediaLit also enforces your plan's limit. |
| `chunkSize` | number |  |  | Bytes per request. By default the file is sent in one request. |
| `onUploadComplete` | `(media: UploadedMedia) => void` |  |  |  |
| `onUploadError` | `(error: MediaLitUploadError) => void` |  |  |  |
| `labels` | `Partial<MediaLitUploaderLabels>` |  |  | Replace any text, for example to translate it. |
| `disabled` | boolean |  | `false` |  |
| `className` | string |  |  | Added to the root element. |

### Translate the text

```tsx
<MediaLitUploader
    signatureEndpoint="/api/medialit/signature"
    labels={{
        prompt: "Déposez un fichier ou cliquez pour parcourir",
        cancel: "Annuler",
        uploaded: "Envoyé",
        uploadAnother: "Envoyer un autre fichier",
        retry: "Réessayer",
        chooseAnother: "Choisir un autre fichier",
        invalidType: "Ce type de fichier n'est pas autorisé",
        tooLarge: (maxSize) => `Taille maximale : ${maxSize}`,
    }}
/>
```

### Style it

`@medialit/react/styles.css` is optional. It follows the system's light or dark mode, and you can change its colours and corners with CSS variables:

```css
.medialit-uploader {
    --medialit-accent: #0f766e;
    --medialit-accent-contrast: #ffffff;
    --medialit-radius: 6px;
    --medialit-font: inherit;
}
```

The other variables are `--medialit-text`, `--medialit-muted`, `--medialit-border`, `--medialit-surface`, `--medialit-surface-hover`, `--medialit-track`, `--medialit-success` and `--medialit-error`.

To style it from scratch, skip the stylesheet and target the `medialit-uploader__*` classes. The root element has `data-status` set to `idle`, `uploading`, `success` or `error`.

## useMediaLitUpload

The same upload logic without any markup, for when you want your own UI.

```tsx
"use client";

export function UploadButton() {
    const { upload, cancel, status, progress, media, error } =
        useMediaLitUpload({
            signatureEndpoint: "/api/medialit/signature",
            access: "public",
        });

    if (status === "uploading") {
        return (
            <button onClick={cancel}>Cancel ({Math.round(progress)}%)</button>
        );
    }

    return (
        <div>
            <input
                type="file"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                }}
            />
            {media && <img src={media.thumbnail || media.file} alt="" />}
            {error && <p role="alert">{error.message}</p>}
        </div>
    );
}
```

It takes the same options as `MediaLitUploader` except `accept`, `maxFileSize`, `labels`, `disabled` and `className`, and returns:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `upload` | `(file: File, options?) => Promise<UploadedMedia or null>` |  |  | Starts an upload and cancels any upload already running. Resolves to null if the upload fails or is cancelled. It never rejects. The options override the hook's options for this upload. |
| `cancel` | `() => void` |  |  | Stops the upload and returns to idle. |
| `reset` | `() => void` |  |  | Same as cancel. Use it to clear a finished upload. |
| `status` | `"idle" or "uploading" or "success" or "error"` |  |  |  |
| `progress` | number |  |  | 0 to 100. |
| `file` | `File or null` |  |  | The file being uploaded or last uploaded. |
| `media` | `UploadedMedia or null` |  |  | Set when status is success. |
| `error` | `MediaLitUploadError or null` |  |  | Set when status is error. `message` is MediaLit’s reason, such as a file over your plan's limit. |

## UploadedMedia

What an upload returns.

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mediaId` | string |  |  | Pass this to your server to seal, get or delete the file. |
| `originalFileName` | string |  |  |  |
| `mimeType` | string |  |  |  |
| `size` | number |  |  | Bytes. |
| `access` | '"public" or "private"' |  |  |  |
| `file` | string |  |  | A signed URL. Public files get their permanent URL when they are sealed. |
| `thumbnail` | string |  |  | Empty when no thumbnail was made. |
| `caption` | string |  |  |  |

> **Note:** Uploads are temporary until your server seals them. See [sealing](/docs/concepts#temporary-uploads-and-sealing).
