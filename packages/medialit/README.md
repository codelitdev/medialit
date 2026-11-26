# medialit

A Node.js server-side SDK for interacting with MediaLit's API to manage media files.

## Installation

```bash
npm install medialit
# or
yarn add medialit
# or
bun add medialit
```

## Usage

```typescript
import { MediaLit } from "medialit";

// Initialize the client (Keep API keys on server)
const medialit = new MediaLit({
    apiKey: process.env.MEDIALIT_API_KEY,
    endpoint: process.env.MEDIALIT_ENDPOINT,
});

// Example usage
app.post("/api/upload", async (req, res) => {
    try {
        const file = req.files.file;
        const media = await medialit.upload(file.path, {
            access: "public",
            caption: req.body.caption,
            group: req.body.group,
        });
        res.json(media);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## File Input Types

The SDK accepts multiple types of file inputs:

1. File Path (string)

```typescript
await medialit.upload("/path/to/file.jpg");
```

2. Buffer

```typescript
const buffer = Buffer.from("file content");
await medialit.upload(buffer);
```

3. Readable Stream

```typescript
const stream = createReadStream("file.jpg");
await medialit.upload(stream);
```

## Configuration

The SDK can be configured using:

### 1. Environment Variables

```bash
MEDIALIT_API_KEY=your-api-key
MEDIALIT_ENDPOINT=https://your-medialit-instance.com  # Optional, defaults to https://api.medialit.cloud
```

### 2. Constructor Options

```typescript
const medialit = new MediaLit({
    apiKey: "your-api-key",
    endpoint: "https://your-medialit-instance.com", // Optional, defaults to https://api.medialit.cloud
});

// Or simply with just the API key
const medialit = new MediaLit({
    apiKey: "your-api-key",
});
```

## API Reference

### `new MediaLit(config?)`

Pass `accessToken` instead of `apiKey` to call MediaLit with an OAuth access token, for example in a tool that logs users in.

Creates a new MediaLit instance.

#### Parameters:

- `config` (optional): Configuration object
    - `apiKey`: API key for authentication
    - `endpoint`: MediaLit API endpoint URL

### `upload(file: FileInput, options?: UploadOptions): Promise<Media>`

Uploads a file to MediaLit. Accepts file path, Buffer, or Readable stream.

#### Parameters:

- `file`: A file path (string), Buffer, or Readable stream
- `options` (optional):
    - `access`: 'public' | 'private' (default: 'private')
    - `caption`: Optional caption for the media
    - `group`: Optional group name to organize media
    - `fileName`: Name to store. Defaults to the file name for a path, otherwise `file`. Its extension sets the type.
    - `mimeType`: Overrides the type found from the file name

#### Returns:

- Promise resolving to the uploaded media object

### `get(mediaId: string): Promise<Media>`

Retrieves details of a specific media file.

#### Parameters:

- `mediaId`: ID of the media to retrieve

#### Returns:

- Promise resolving to the media object

### `list(page?: number, limit?: number, filters?: ListFilters): Promise<Media[]>`

Lists media files with pagination and filtering options.

#### Parameters:

- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of items per page (default: 10)
- `filters` (optional):
    - `access`: Filter by 'public' or 'private' access
    - `group`: Filter by group name

#### Returns:

- Promise resolving to an array of media objects

### `delete(mediaId: string): Promise<void>`

Deletes a media file.

#### Parameters:

- `mediaId`: ID of the media to delete

### `getCount(): Promise<number>`

Gets the total count of media files.

#### Returns:

- Promise resolving to the total number of media files

### `getStats(): Promise<MediaStats>`

Gets storage statistics.

#### Returns:

- Promise resolving to a MediaStats object:
    ```typescript
    interface MediaStats {
        storage: number; // Current storage used in bytes
        maxStorage: number; // Maximum allowed storage in bytes
        // Video processing minutes this month; allowed is null with no limit
        processingMinutes?: { used: number; allowed: number | null };
    }
    ```

### `getSettings(): Promise<MediaSettings>`

Gets the current media settings.

#### Returns:

- Promise resolving to a MediaSettings object

### `updateSettings(settings: MediaSettingsUpdate): Promise<void>`

Updates the media settings. Pass only the fields to change; changes apply to files sealed afterwards.

#### Parameters:

- `settings`:
    - `useWebP`: Whether to convert images to WebP format
    - `webpOutputQuality`: Quality of WebP conversion (1-100, 80 when not set)
    - `videoStreaming`: `"off"`, `"hls"` or `"mp4"`, what is made from sealed videos. Apps start `"off"`
    - `hlsRenditions`: HLS sizes from `"1080p"`, `"720p"`, `"480p"` and `"360p"`, or `null` for the default sizes

### Webhooks

Webhook endpoints are told when processing of sealed media finishes (`media.processing.ready`) or fails (`media.processing.failed`). Requests are signed per [Standard Webhooks](https://www.standardwebhooks.com/) with the endpoint's `secret`.

- `listWebhooks(): Promise<WebhookEndpoint[]>`: the app's endpoints. Secrets are left out; each has a `secretHint` (its last characters).
- `revealWebhookSecret(id): Promise<string>`: an endpoint's signing secret. Needs write access.
- `createWebhook({ url, events?, enabled? }): Promise<WebhookEndpoint>`: adds an endpoint and returns it with its `secret`. `events` defaults to every event. In production the URL must use `https`, and it may not point at a private or internal address.
- `updateWebhook(id, { url?, events?, enabled?, rotateSecret? }): Promise<WebhookEndpoint>`: changes an endpoint. `rotateSecret: true` replaces its secret and returns the new one.
- `deleteWebhook(id): Promise<void>`
- `testWebhook(id): Promise<WebhookTestResult>`: sends a signed `webhook.test` event now. Returns `{ result: "delivered", status }` or `{ result: "failed" }` with a `status` or a generic `error` (`timeout`, `connection_failed`, `tls_error`, `blocked_address`).

### `getSignature(options?: { group?: string }): Promise<string>`

Creates a short-lived signature that lets a browser upload to MediaLit without your API key. Uploads made with it go into `group` when you pass one.

### `createSignatureHandler(options): (request: Request) => Promise<Response>`

Creates a `POST` route handler that returns `{ signature, endpoint }` for browser uploads with [`@medialit/react`](../react) or [`@medialit/uploader`](../uploader). It works anywhere with the Fetch API `Request` and `Response`, such as Next.js route handlers, Hono, Remix, and Bun.

```typescript
// app/api/medialit/signature/route.ts
import { createSignatureHandler } from "medialit";

export const POST = createSignatureHandler({
    authorize: async (request) => {
        const user = await getUser(request); // your app's auth
        return user ? { group: user.teamId } : false;
    },
});
```

#### Options:

- `authorize` (required): Return `false` or `null` to refuse with 401, `true` to allow, or `{ group }` to allow and put the uploads in a group. Anyone who passes this check can upload to your MediaLit app.
- `apiKey`, `endpoint` (optional): Same as the constructor. They are read when the first request arrives.
- `client` (optional): An existing `MediaLit` client to use instead.
- `publicEndpoint` (optional): The MediaLit URL the browser should use when it differs from the one your server uses, for example inside Docker.

## Media Object Structure

The Media object returned by the API includes:

```typescript
interface Media {
    mediaId: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: "private" | "public";
    group?: string;
    caption?: string;
}
```

## Type Definitions

```typescript
interface UploadOptions {
    group?: string;
    access?: "private" | "public";
    caption?: string;
}

interface MediaStats {
    storage: number;
    maxStorage: number;
}

interface MediaSettings {
    useWebP?: boolean;
    webpOutputQuality?: number;
}
```

## Error Handling

The SDK implements consistent error handling:

1. **Environment Check**:

    - Throws error if initialized in a browser environment
    - Error message: "MediaLit SDK is only meant to be used in a server-side Node.js environment"

2. **API Key Validation**:

    - Throws error if API key is missing
    - Error message: "API Key is required"

3. **File Input Validation**:
    - Throws error for invalid file inputs
    - Error message: "Invalid file input. Must be a file path, Buffer, or Readable stream"

Example:

```typescript
try {
    const media = await medialit.upload(file);
} catch (error) {
    if (error.message.includes("server-side Node.js environment")) {
        console.error("SDK cannot be used in browser environment");
    } else if (error.message === "API Key is required") {
        console.error("Missing API key configuration");
    } else {
        console.error("Operation failed:", error.message);
    }
}
```

## Development

### Running Tests

```bash
bun run test
```

## TypeScript Support

This package includes TypeScript type definitions. No additional type packages are required.

## Requirements

- Node.js >= 18.0.0

## Contributing

Please refer to the main MediaLit repository's contributing guidelines.

## License

MIT License
