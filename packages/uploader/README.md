# @medialit/uploader

Resumable browser uploads to [MediaLit](https://medialit.cloud), with no framework dependency. For React, use [`@medialit/react`](../react), which wraps this package.

## Install

```bash
npm install @medialit/uploader
```

## Usage

Your backend returns an upload signature (see `createSignatureHandler` in the [`medialit`](../medialit) SDK). The browser then uploads directly to MediaLit:

```ts
import { uploadFile, isUploadAbortedError } from "@medialit/uploader";

const controller = new AbortController();

try {
    const media = await uploadFile(file, {
        signatureEndpoint: "/api/medialit/signature",
        access: "public",
        signal: controller.signal,
        onProgress: ({ percentage }) => console.log(`${percentage}%`),
    });
    console.log(media.mediaId, media.file);
} catch (err) {
    if (!isUploadAbortedError(err)) console.error(err.message);
}
```

Call `controller.abort()` to cancel. An interrupted upload of the same file resumes where it stopped unless you pass `resume: false`.

Uploads are temporary until your backend seals them with `medialit.seal(mediaId)`.

## Options

| Option              | Type                                                  | Description                                                  |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `signatureEndpoint` | `string`                                              | Your route that returns `{ signature, endpoint }` on `POST`. |
| `getSignature`      | `() => Promise<{ signature, endpoint }>`              | Use instead of `signatureEndpoint` to fetch it yourself.     |
| `access`            | `"public" \| "private"`                               | Defaults to `private`.                                       |
| `caption`           | `string`                                              |                                                              |
| `fileName`          | `string`                                              | Required for a `Blob` that is not a `File`.                  |
| `chunkSize`         | `number`                                              | Bytes per request. Defaults to one request.                  |
| `retryDelays`       | `number[]`                                            | Milliseconds before each retry.                              |
| `resume`            | `boolean`                                             | Defaults to `true`.                                          |
| `signal`            | `AbortSignal`                                         | Cancels the upload.                                          |
| `onProgress`        | `({ bytesUploaded, bytesTotal, percentage }) => void` |                                                              |

## Errors

Failures reject with `MediaLitUploadError`. Its `message` is MediaLit's reason (for example a file over your plan's limit) and `status` is the HTTP status when there was one. Cancelling rejects with `UploadAbortedError`.
