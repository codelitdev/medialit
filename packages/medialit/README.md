# medialit

A Node.js server-side SDK for interacting with MediaLit's API to manage media files.

## Installation

```bash
npm install medialit
# or
yarn add medialit
# or
pnpm add medialit
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
    }
    ```

### `getSettings(): Promise<MediaSettings>`

Gets the current media settings.

#### Returns:

- Promise resolving to a MediaSettings object

### `updateSettings(settings: MediaSettings): Promise<void>`

Updates the media settings.

#### Parameters:

- `settings`: A MediaSettings object:
    - `useWebP`: Whether to convert images to WebP format
    - `webpOutputQuality`: Quality of WebP conversion (0-100)
    - `thumbnailWidth`: Width of generated thumbnails
    - `thumbnailHeight`: Height of generated thumbnails

### `getPresignedUploadUrl(options?: { group?: string }): Promise<string>`

Gets a presigned URL for direct upload to MediaLit. You can share the generated URL to the client side apps.

#### Parameters:

- `options` (optional):
    - `group`: Optional group name to organize media

#### Returns:

- Promise resolving to a presigned URL string

<!-- ### `uploadWithPresignedUrl(presignedUrl: string, file: File, options?: UploadOptions): Promise<Media>`

Uploads a file using a presigned URL.

#### Parameters:
- `presignedUrl`: The presigned URL obtained from `getPresignedUploadUrl()`
- `file`: A File object to upload
- `options` (optional):
  - `access`: 'public' | 'private' (default: 'private')
  - `caption`: Optional caption for the media
  - `group`: Optional group name to organize media

#### Returns:
- Promise resolving to the uploaded media object -->

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
    thumbnailWidth?: number;
    thumbnailHeight?: number;
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
pnpm test
```

## TypeScript Support

This package includes TypeScript type definitions. No additional type packages are required.

## Requirements

- Node.js >= 18.0.0

## Contributing

Please refer to the main MediaLit repository's contributing guidelines.

## License

MIT License
