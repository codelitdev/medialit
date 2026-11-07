import busboy from "busboy";
import { PassThrough, type Readable } from "stream";
import type { Upload } from "@aws-sdk/lib-storage";
import type { Request } from "express";
import { cloudBucket } from "../config/constants";
import { FILE_IS_REQUIRED, FILE_SIZE_EXCEEDED } from "../config/strings";
import { streamToObject } from "../services/s3";
import { abandonUpload, newUploadTarget, type UploadTarget } from "./ingest";

export interface ReceivedUpload extends UploadTarget {
    originalFileName: string;
    mimeType: string;
    /** Bytes stored. */
    size: number;
    /** Text fields of the form, whether they came before or after the file. */
    fields: Record<string, string>;
}

export class UploadRejectedError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

const MAX_FIELDS = 20;
const MAX_FIELD_SIZE = 64 * 1024;

/**
 * Streams the `file` field of a multipart request straight to its final key
 * in the private bucket. Nothing is written to local disk, and at most
 * `UPLOAD_PART_SIZE_BYTES` × `UPLOAD_PART_CONCURRENCY` is held in memory.
 *
 * A file over `maxFileSize` is cut off and its upload aborted, so nothing is
 * stored. The same happens when the client disconnects mid-upload.
 */
export function receiveMultipartUpload(
    req: Request,
    {
        maxFileSize,
        begin,
        streamTo = streamToObject,
        discard = abandonUpload,
    }: {
        maxFileSize: number;
        /** Records the upload before any of it reaches the bucket. */
        begin: (
            target: UploadTarget,
            file: { originalFileName: string; mimeType: string },
        ) => Promise<void>;
        /** Swappable for tests. */
        streamTo?: (params: {
            Key: string;
            Body: Readable;
            ContentType: string;
            Bucket?: string;
        }) => Pick<Upload, "done">;
        discard?: (target: UploadTarget) => Promise<void>;
    },
): Promise<ReceivedUpload> {
    return new Promise((resolve, reject) => {
        let parser: busboy.Busboy;
        try {
            parser = busboy({
                headers: req.headers,
                limits: {
                    // busboy flags a file that reaches the limit; one more
                    // byte lets a file of exactly maxFileSize through.
                    fileSize: maxFileSize + 1,
                    files: 1,
                    fields: MAX_FIELDS,
                    fieldSize: MAX_FIELD_SIZE,
                },
            });
        } catch (err: any) {
            reject(new UploadRejectedError(400, err.message));
            return;
        }

        const fields: Record<string, string> = {};
        let target: UploadTarget | undefined;
        let fileInfo: { originalFileName: string; mimeType: string };
        let size = 0;
        let truncated = false;
        let body: PassThrough | undefined;
        let uploadDone: Promise<unknown> | undefined;
        let settled = false;

        const fail = async (err: Error) => {
            if (settled) return;
            settled = true;
            req.unpipe(parser);
            // Failing the body, rather than calling the upload's abort(),
            // lets the upload send AbortMultipartUpload before done() rejects.
            // abort() rejects done() at once and leaves the multipart upload
            // waiting on a body that never ends.
            body?.destroy(err);
            await uploadDone?.catch(() => {});
            // A small file may have gone up in one request before the abort.
            if (target) await discard(target);
            reject(err);
        };

        parser.on("field", (name, value) => {
            fields[name] = value;
        });

        parser.on("file", (name, file, info) => {
            if (name !== "file" || target) {
                file.resume();
                return;
            }
            target = newUploadTarget(info.filename || "file");
            fileInfo = {
                originalFileName: info.filename || "file",
                mimeType: info.mimeType || "application/octet-stream",
            };
            body = new PassThrough();
            // fail() destroys the body with its error; if streaming never
            // started nothing else listens, and an unheard "error" would
            // crash the process.
            body.on("error", () => {});
            file.on("limit", () => {
                truncated = true;
                fail(
                    new UploadRejectedError(
                        400,
                        `${FILE_SIZE_EXCEEDED}. Allowed: ${maxFileSize} bytes`,
                    ),
                );
            });
            const uploadTarget = target;
            const uploadBody = body;
            // Nothing reaches the bucket until the upload is recorded, so a
            // crash can never leave an object no record points to.
            const recorded = begin(uploadTarget, fileInfo);
            uploadDone = recorded.then(() => {
                if (settled) throw new Error("Upload aborted");
                // Count only once piped; a data listener alone would start
                // the file flowing before anything reads it.
                file.on("data", (chunk: Buffer) => {
                    size += chunk.length;
                });
                file.pipe(uploadBody);
                return streamTo({
                    Key: uploadTarget.key,
                    Body: uploadBody,
                    ContentType: fileInfo.mimeType,
                    Bucket: cloudBucket,
                }).done();
            });
            recorded.catch((err: Error) => fail(err));
            // Handled in "close" or fail(); avoid an unhandled rejection.
            uploadDone.catch(() => {});
        });

        parser.on("error", (err: Error) => {
            fail(new UploadRejectedError(400, err.message));
        });

        parser.on("close", async () => {
            if (settled) return;
            if (!target || !uploadDone) {
                settled = true;
                reject(new UploadRejectedError(400, FILE_IS_REQUIRED));
                return;
            }
            try {
                await uploadDone;
            } catch (err: any) {
                await fail(err);
                return;
            }
            if (truncated) return;
            settled = true;
            resolve({
                ...target,
                ...fileInfo,
                size,
                fields,
            });
        });

        // The client went away before the form ended.
        req.on("close", () => {
            if (!req.complete) {
                fail(new UploadRejectedError(400, "Upload aborted"));
            }
        });

        req.pipe(parser);
    });
}
