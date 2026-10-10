---
title: Next.js
slug: next-app-router
nav_order: 10
---

You will add an uploader that sends files from the browser straight to MediaLit, then keep the file when the user saves. The full app is in [examples/next-app-router](https://github.com/codelitdev/medialit/tree/main/examples/next-app-router).

### Install the packages

```bash
npm install medialit @medialit/react
```

`medialit` runs on your server and holds the API key. `@medialit/react` is the browser uploader.
### Add your API key

Add the key from your app's settings in the [dashboard](https://app.medialit.cloud) to `.env.local`:

```bash
MEDIALIT_API_KEY=your_api_key
# Only if you self-host MediaLit
# MEDIALIT_ENDPOINT=https://medialit.example.com
```
### Create the signature route

The uploader asks this route for a short-lived upload signature, so the API key never reaches the browser.

```ts
export const POST = createSignatureHandler({
    authorize: async () => {
        const session = await auth();
        return !!session;
    },
});
```

> **Warning:** Anyone who passes `authorize` can upload to your MediaLit app. Return `false` for visitors who are not signed in.

To put each user's files in their own group, return a group instead of `true`:

```ts
authorize: async () => {
    const session = await auth();
    return session ? { group: session.user.id } : false;
},
```
### Add the uploader

```tsx
"use client";

export function AvatarUpload() {
    const [mediaId, setMediaId] = useState<string>();

    return (
        <form action={() => mediaId && saveAvatar(mediaId)}>
            <MediaLitUploader
                signatureEndpoint="/api/medialit/signature"
                access="public"
                accept="image/*"
                maxFileSize={5 * 1024 * 1024}
                onUploadComplete={(media) => setMediaId(media.mediaId)}
            />
            <button type="submit" disabled={!mediaId}>
                Save
            </button>
        </form>
    );
}
```

The uploader shows a drop zone, upload progress with a cancel button, and the uploaded file. Read [React](/docs/react) to change its text, style or behaviour.
### Seal the file when the user saves

The upload is temporary until you seal it. If the user leaves without saving, MediaLit deletes it after 24 hours.

```ts
"use server";

const medialit = new MediaLit();

export async function saveAvatar(mediaId: string) {
    const media = await medialit.seal(mediaId);
    // Save media.mediaId and media.file with the user's profile.
}
```

Sealing a public file gives it its permanent URL, so save the `file` returned by `seal`, not the one from the upload.

## Show private files

Private files have signed URLs that expire. Store the `mediaId` and get a fresh URL when you render the page:

```tsx
const medialit = new MediaLit();

export default async function DocumentPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const document = await getDocument(id); // from your database
    const media = await medialit.get(document.mediaId);

    return <a href={media.file}>Download {media.originalFileName}</a>;
}
```

## Delete files

```ts
await medialit.delete(mediaId);
```

## Next steps

- [React](/docs/react) covers every prop of `MediaLitUploader` and the `useMediaLitUpload` hook for your own UI.
- [Node.js SDK](/docs/node-sdk) lists everything the server SDK can do.
- [How MediaLit works](/docs/concepts) explains sealing, access and groups.
