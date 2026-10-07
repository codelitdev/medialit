export class MediaLitUploadError extends Error {
    /** HTTP status from MediaLit or your signature endpoint, when there was one. */
    readonly status?: number;
    readonly cause?: unknown;

    constructor(
        message: string,
        options: { status?: number; cause?: unknown } = {},
    ) {
        super(message);
        this.name = "MediaLitUploadError";
        this.status = options.status;
        this.cause = options.cause;
    }
}

export class UploadAbortedError extends Error {
    constructor() {
        super("Upload cancelled");
        this.name = "UploadAbortedError";
    }
}

export function isUploadAbortedError(err: unknown): err is UploadAbortedError {
    return err instanceof Error && err.name === "UploadAbortedError";
}
