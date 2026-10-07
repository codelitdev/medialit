export type Access = "public" | "private";

/**
 * A `File` or `Blob` in the browser. In Node.js, a stream from
 * `fs.createReadStream`, which can be resumed after a dropped connection.
 */
export type UploadSource =
    | Blob
    | { readonly path: unknown; pipe(destination: never): unknown };

/** The media object MediaLit returns once an upload finishes. */
export interface UploadedMedia {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: Access;
    /** Signed URL until the media is sealed and public. */
    file: string;
    /** Empty when MediaLit did not generate a thumbnail. */
    thumbnail: string;
    caption?: string;
    group?: string;
}

/** What your backend returns after asking MediaLit for an upload signature. */
export interface UploadSignature {
    signature: string;
    /** MediaLit API URL that the browser can reach. */
    endpoint: string;
}

export interface UploadProgress {
    bytesUploaded: number;
    bytesTotal: number;
    /** 0 to 100. */
    percentage: number;
}

export interface SignatureOptions {
    /**
     * Your backend route that returns `{ signature, endpoint }`. It is called
     * with `POST` and the browser's cookies.
     */
    signatureEndpoint?: string;
    /** Use instead of `signatureEndpoint` when you need to fetch it yourself. */
    getSignature?: () => Promise<UploadSignature>;
}

export interface UploadFileOptions extends SignatureOptions {
    /** Defaults to `private`. */
    access?: Access;
    caption?: string;
    /** Required for a `Blob` that is not a `File`, and for a Node.js stream. */
    fileName?: string;
    /** Defaults to the `Blob`'s type. */
    mimeType?: string;
    /** Bytes per request. Defaults to sending the file in one request. */
    chunkSize?: number;
    /** Milliseconds to wait before each retry. */
    retryDelays?: number[];
    /** Resume an interrupted upload of the same file. Defaults to `true`. */
    resume?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: UploadProgress) => void;
}
