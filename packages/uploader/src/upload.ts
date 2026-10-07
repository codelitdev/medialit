import { Upload, type UploadOptions } from "tus-js-client";
import { MediaLitUploadError, UploadAbortedError } from "./errors";
import { resolveSignature } from "./signature";
import type { UploadFileOptions, UploadSource, UploadedMedia } from "./types";

const DEFAULT_RETRY_DELAYS = [0, 3000, 5000, 10000];

/**
 * Uploads a file to MediaLit with the tus resumable protocol. The upload stays
 * temporary until your backend seals it with the MediaLit SDK.
 */
export async function uploadFile(
    file: UploadSource,
    options: UploadFileOptions,
): Promise<UploadedMedia> {
    const { signal } = options;
    if (signal?.aborted) throw new UploadAbortedError();

    const { signature, endpoint } = await resolveSignature(
        options,
        signal,
    ).catch((err) => {
        throw signal?.aborted ? new UploadAbortedError() : err;
    });
    if (signal?.aborted) throw new UploadAbortedError();

    const blob =
        typeof Blob !== "undefined" && file instanceof Blob ? file : null;
    const fileName = options.fileName || (blob as File | null)?.name;
    if (!fileName) {
        throw new MediaLitUploadError(
            "Pass fileName when uploading a Blob or a stream",
        );
    }

    return new Promise<UploadedMedia>((resolve, reject) => {
        let settled = false;
        const settle = (finish: () => void) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            finish();
        };

        const tusOptions: UploadOptions = {
            endpoint: `${endpoint.replace(/\/+$/, "")}/media/create/resumable`,
            headers: { "x-medialit-signature": signature },
            metadata: {
                fileName,
                mimeType:
                    options.mimeType ||
                    blob?.type ||
                    "application/octet-stream",
                access: options.access || "private",
                caption: options.caption || "",
            },
            retryDelays: options.retryDelays || DEFAULT_RETRY_DELAYS,
            removeFingerprintOnSuccess: true,
            onProgress: (bytesUploaded, bytesTotal) => {
                options.onProgress?.({
                    bytesUploaded,
                    bytesTotal,
                    percentage: bytesTotal
                        ? (bytesUploaded / bytesTotal) * 100
                        : 0,
                });
            },
            onSuccess: ({ lastResponse }) => {
                const media = parseMedia(lastResponse.getHeader("media"));
                settle(() =>
                    media
                        ? resolve(media)
                        : reject(
                              new MediaLitUploadError(
                                  "The upload finished but MediaLit did not return the media",
                              ),
                          ),
                );
            },
            onError: (err) => settle(() => reject(toUploadError(err))),
        };
        // tus-js-client overwrites its defaults with undefined values.
        if (options.chunkSize) tusOptions.chunkSize = options.chunkSize;

        // tus-js-client's Node.js build reads streams; its types only list
        // browser inputs.
        const upload = new Upload(file as Blob, tusOptions);

        const onAbort = () => {
            upload.abort().catch(() => undefined);
            settle(() => reject(new UploadAbortedError()));
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const start = async () => {
            if (options.resume !== false) {
                const previous = await upload
                    .findPreviousUploads()
                    .catch(() => []);
                if (previous.length) {
                    upload.resumeFromPreviousUpload(previous[0]);
                }
            }
            if (!settled) upload.start();
        };
        start();
    });
}

function parseMedia(header: string | undefined): UploadedMedia | null {
    if (!header) return null;
    try {
        const media = JSON.parse(header);
        return media?.mediaId ? media : null;
    } catch {
        return null;
    }
}

function toUploadError(err: Error): MediaLitUploadError {
    const response = (
        err as {
            originalResponse?: {
                getStatus(): number;
                getBody(): string;
            } | null;
        }
    ).originalResponse;
    const body = response?.getBody()?.trim();
    return new MediaLitUploadError(body || err.message, {
        status: response?.getStatus(),
        cause: err,
    });
}
