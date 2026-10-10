---
title: Node.js SDK
slug: node-sdk
nav_order: 50
---

The `medialit` package calls the MediaLit API with your app's API key. It runs on the server only and refuses to start in a browser.

```bash
npm install medialit
```

Node.js 18 or later is required.

## new MediaLit()

```ts
const medialit = new MediaLit({
    apiKey: process.env.MEDIALIT_API_KEY,
    endpoint: process.env.MEDIALIT_ENDPOINT,
});
```

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `apiKey` | string |  | MEDIALIT_API_KEY | Your app's API key. Read from the environment when you leave it out. |
| `accessToken` | string |  |  | An OAuth access token to use instead of an API key, for tools that log users in. |
| `endpoint` | string |  | MEDIALIT_ENDPOINT or https://api.medialit.cloud | Set this when you self-host MediaLit. |

Every method throws an `Error` with MediaLit's message when a request fails.

## upload

```ts
const media = await medialit.upload("./photo.jpg", {
    access: "public",
    caption: "Team photo",
});
```

Uploads a file path, a `Buffer` or a readable stream in one request. The file is [temporary until you seal it](/docs/concepts#temporary-uploads-and-sealing).

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `access` | `"public" or "private"` |  | `"private"` |  |
| `caption` | string |  |  |  |
| `group` | string |  |  | Puts the file in a group. |
| `fileName` | string |  |  | Name to store. Defaults to the file name for a path, otherwise `file`. Its extension sets the type. |
| `mimeType` | string |  |  | Overrides the type found from the file name. |

## seal

```ts
const media = await medialit.seal(mediaId);
```

Keeps a temporary upload. Returns the media with its final `file` URL, which changes for public files. Sealing a file that is already sealed returns it unchanged.

## get

```ts
const media = await medialit.get(mediaId);
```

Returns one file, including temporary ones. Private files come with a new signed URL each time.

## list

```ts
const media = await medialit.list(1, 20, { access: "public", group: "avatars" });
```

Returns a page of sealed files, newest first. The arguments are the page number, the page size and optional `access` and `group` filters.

## delete

```ts
await medialit.delete(mediaId);
```

Deletes the file and its thumbnail.

## getCount and getStats

```ts
const count = await medialit.getCount(); // sealed files
const { storage, maxStorage } = await medialit.getStats(); // bytes
```

## getSettings and updateSettings

```ts
await medialit.updateSettings({ useWebP: true, webpOutputQuality: 80 });
const settings = await medialit.getSettings();
```

Image processing settings for the app. `useWebP` converts uploaded images to WebP, at a `webpOutputQuality` from 0 to 100.

## getSignature

```ts
const signature = await medialit.getSignature({ group: "avatars" });
```

Creates an [upload signature](/docs/concepts#upload-signatures) for a browser. Pass it to the browser together with `medialit.endpoint`. Files uploaded with it go into `group` when you pass one.

## createSignatureHandler

Creates a `POST` route that returns `{ signature, endpoint }` for [`@medialit/react`](/docs/react) and [`@medialit/uploader`](/docs/other-frameworks). It works with any framework that uses the Fetch API's `Request` and `Response`, such as Next.js, Hono, Remix and Bun. For Express, see [Let browsers upload](/docs/express-js#let-browsers-upload).

```ts
export const POST = createSignatureHandler({
    authorize: async (request) => {
        const user = await getUser(request); // your app's authentication
        return user ? { group: user.id } : false;
    },
});
```

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `authorize` | `(request: Request) => boolean or { group?: string } or null or Promise<...>` | Yes |  | Return false or null to refuse with 401, true to allow, or `{ group }` to allow and put uploads in a group. Anyone who passes this check can upload to your MediaLit app. |
| `apiKey` | string |  |  | Same as the constructor. Read when the first request arrives. |
| `endpoint` | string |  |  | Same as the constructor. |
| `client` | MediaLit |  |  | An existing client to use instead of apiKey and endpoint. |
| `publicEndpoint` | string |  |  | The MediaLit URL for the browser when it differs from the one your server uses, for example inside Docker. |

If MediaLit refuses to create a signature, the route responds with 500 and `{ error }`.
