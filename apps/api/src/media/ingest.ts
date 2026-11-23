import os from "os";
import path from "path";
import { mkdir, mkdtemp, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import thumbnail from "@medialit/thumbnail";
import { checkImageFile } from "@medialit/images";
import { Constants } from "@medialit/models";
import {
    cloudBucket,
    imagePatternForThumbnailGeneration,
    PATH_PREFIX,
    tempFileDirForUploads,
    videoPattern,
} from "../config/constants";
import { NOT_ENOUGH_STORAGE } from "../config/strings";
import {
    deleteObject,
    downloadObject,
    generateSignedUrl,
    headObject,
    putObject,
    putObjectTagging,
} from "../services/s3";
import { webpLimits } from "./webp-limits";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { mediaKind } from "./kind";
import { describeError } from "../jobs/errors";
import * as presignedUrlService from "../signature/service";
import generateFileName from "./utils/generate-file-name";
import generateKey from "./utils/generate-key";
import getTags from "./utils/get-tags";
import {
    completeUploadingMediaRecord,
    createUploadingMediaRecord,
    deleteUploadingMediaRecord,
    getUploadingMediaSize,
} from "@/db";
import { hasEnoughStorage } from "./storage-middleware";

/** An image the thumbnail step refuses to decode (over the pixel limit). */
class ThumbnailSkipped extends Error {
    constructor(readonly reason: string) {
        super(`Thumbnail skipped: ${reason}`);
    }
}

/** Where a new upload is written: its media ID and final key, chosen before
 * the first byte arrives so the upload can stream straight to its place. */
export interface UploadTarget {
    mediaId: string;
    /** Extension of the uploaded file, safe to use in keys. */
    ext: string;
    /** `{PATH_PREFIX}/i/{mediaId}/main.{ext}` in the private bucket. */
    key: string;
}

export function newUploadTarget(fileName: string): UploadTarget {
    const { name: mediaId, ext } = generateFileName(fileName);
    return { mediaId, ext, key: mainKey(mediaId, ext) };
}

function mainKey(mediaId: string, ext: string): string {
    return generateKey({
        mediaId,
        path: Constants.PathKey.PRIVATE,
        filename: `main.${ext}`,
    });
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const uploadKeyPattern = new RegExp(
    `^${PATH_PREFIX ? `${escapeRegex(PATH_PREFIX)}/` : ""}${
        Constants.PathKey.PRIVATE
    }/([A-Za-z0-9_-]{1,64})/main\\.([A-Za-z0-9]{1,10})$`,
);

/** Reads an upload key back into its target, or `null` if the key isn't one
 * `newUploadTarget` could have made. Keeps clients from pointing an upload
 * at any other object. */
export function parseUploadKey(key: string): UploadTarget | null {
    const match = uploadKeyPattern.exec(key);
    if (!match) return null;
    return { mediaId: match[1], ext: match[2], key };
}

/**
 * Records an upload as it starts, before any bytes reach the bucket. The
 * temp row is hidden until the upload finishes, and its declared size counts
 * toward storage meanwhile. If the server dies mid-upload, the temp cleanup
 * job finds the row and removes whatever reached the bucket.
 */
export async function startUpload(
    target: UploadTarget,
    upload: {
        userId: string;
        appId: string;
        originalFileName: string;
        mimeType: string;
        /** Bytes the client says it will send; 0 when unknown. */
        declaredSize: number;
    },
): Promise<void> {
    await createUploadingMediaRecord({
        mediaId: target.mediaId,
        userId: upload.userId,
        appId: upload.appId,
        fileName: `main.${target.ext}`,
        originalFileName: upload.originalFileName,
        mimeType: upload.mimeType,
        size: Math.max(0, Math.floor(upload.declaredSize)),
    });
}

/** Drops an upload that won't be kept: its objects and its row. */
export async function abandonUpload(
    target: UploadTarget,
    extraKeys: string[] = [],
): Promise<void> {
    await deleteStored([target.key, ...extraKeys]);
    await deleteUploadingMediaRecord(target.mediaId).catch((err) => {
        logger.error(
            { err, mediaId: target.mediaId },
            "Failed to delete an abandoned upload's record",
        );
    });
}

/** How an upload arrived, for logs and events. */
export type UploadTransport = "form" | "tus" | "mcp";

export interface StoredUpload extends UploadTarget {
    transport: UploadTransport;
    userId: string;
    appId: string;
    /** The name the client gave the file. */
    originalFileName: string;
    /** The type the client declared. */
    mimeType: string;
    access?: string;
    caption?: string;
    group?: string;
    signature?: string;
}

/**
 * Finishes an upload whose file is already stored at `key` in the private
 * bucket. Shared by every upload path (form-data, tus, MCP):
 *
 * 1. Checks storage again with the size actually stored. The original is
 *    kept as uploaded: WebP conversion happens at seal (`sealMedia`).
 * 2. Makes a thumbnail: 16:9 and up to 480 px for images, 720 px tall for
 *    videos.
 *    Videos are read through a presigned URL, so only the bytes ffmpeg needs
 *    are fetched.
 * 3. Marks the media record `startUpload` wrote as uploaded.
 *
 * If any step but the thumbnail fails, every object it stored and its record
 * are deleted, so a rejected upload leaves nothing behind.
 */
export async function finalizeStoredUpload(
    upload: StoredUpload,
): Promise<string> {
    const { mediaId, ext, key, userId, appId } = upload;
    const startedAt = Date.now();
    let storedSize = 0;
    let thumbnailOutcome: "made" | "skipped" | "failed" | "none" = "none";
    const tags = getTags(userId, upload.group);
    const stored = new Set<string>([key]);
    let workDir: string | undefined;

    try {
        // mkdtemp makes only the last directory; the configured one may not
        // exist yet, as in a fresh container.
        const tempRoot = tempFileDirForUploads || os.tmpdir();
        await mkdir(tempRoot, { recursive: true });
        workDir = await mkdtemp(path.join(tempRoot, "medialit-finalize-"));
        const isImage = imagePatternForThumbnailGeneration.test(
            upload.mimeType,
        );
        const isVideo = videoPattern.test(upload.mimeType);

        const fileName = `main.${ext}`;
        const mimeType = upload.mimeType;
        const head = await headObject({ Key: key, Bucket: cloudBucket });
        const size = head.ContentLength ?? 0;
        storedSize = size;
        await putObjectTagging({ Key: key, Tagging: tags });

        // The total already holds this upload's declared size; swap it for
        // the size actually stored. Other uploads, finished or not, count too.
        const reserved = await getUploadingMediaSize(mediaId);
        if (reserved === null) {
            throw new Error("The upload expired before it finished");
        }
        if (
            !(await hasEnoughStorage(size - reserved, { _id: userId } as any))
        ) {
            throw new Error(NOT_ENOUGH_STORAGE);
        }

        let thumbnailGenerated = false;
        let thumbnailSize = 0;
        if (isImage || isVideo) {
            const thumbKey = generateKey({
                mediaId,
                path: Constants.PathKey.PRIVATE,
                filename: "thumb.webp",
            });
            const thumbPath = path.join(workDir, "thumb.webp");
            try {
                if (isImage) {
                    // Images are small; read them back for the thumbnail.
                    const localPath = path.join(workDir, "source");
                    await downloadObject({ Key: key, destination: localPath });
                    // Decoders allocate by pixels, so a small image with huge
                    // dimensions is refused from its header, never decoded.
                    const check = await checkImageFile(localPath, {
                        maxInputBytes: Number.MAX_SAFE_INTEGER,
                        maxPixels: webpLimits().maxPixels,
                    });
                    if (!check.ok) throw new ThumbnailSkipped(check.reason);
                    await thumbnail.forImage(localPath, thumbPath);
                } else {
                    // A URL MediaLit made, never one from the client.
                    const source = await generateSignedUrl(key, cloudBucket);
                    await thumbnail.forVideo(source, thumbPath);
                }
                await putObject({
                    Key: thumbKey,
                    Body: createReadStream(thumbPath),
                    ContentType: "image/webp",
                    Tagging: tags,
                    Bucket: cloudBucket,
                });
                stored.add(thumbKey);
                thumbnailGenerated = true;
                thumbnailSize = (await stat(thumbPath)).size;
                thumbnailOutcome = "made";
            } catch (err: any) {
                thumbnailOutcome =
                    err instanceof ThumbnailSkipped ? "skipped" : "failed";
                if (err instanceof ThumbnailSkipped) {
                    logger.info(
                        { media_id: mediaId, reason: err.reason },
                        "thumbnail skipped",
                    );
                } else {
                    // Video errors name the presigned URL; keep it out.
                    logger.error(
                        { error: describeError(err), media_id: mediaId },
                        "Failed to generate thumbnail",
                    );
                }
            }
        }

        const completed = await completeUploadingMediaRecord({
            mediaId,
            fileName,
            mimeType,
            size,
            thumbnailGenerated,
            thumbnailSize,
            accessControl:
                upload.access === Constants.AccessControl.PUBLIC
                    ? Constants.AccessControl.PUBLIC
                    : Constants.AccessControl.PRIVATE,
            group: upload.group,
            caption: upload.caption,
        });
        if (!completed) {
            throw new Error("The upload expired before it finished");
        }
    } catch (err) {
        await deleteStored([...stored]);
        await deleteUploadingMediaRecord(mediaId).catch(() => {});
        throw err;
    } finally {
        if (workDir) {
            await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
    }

    const finished = {
        media_id: mediaId,
        app_id: appId,
        transport: upload.transport,
        media_kind: mediaKind(upload.mimeType),
        size_bytes: storedSize,
        duration_ms: Date.now() - startedAt,
    };
    logger.info(finished, "upload finished");
    trackEvent({
        event: "media.uploaded",
        source: "media.upload",
        appId,
        userId,
        properties: {
            media_id: mediaId,
            transport: finished.transport,
            media_kind: finished.media_kind,
            size_bytes: finished.size_bytes,
            thumbnail: thumbnailOutcome,
        },
    });

    if (upload.signature) {
        presignedUrlService
            .cleanup(userId, upload.signature)
            .catch((err: any) => {
                logger.error(
                    { err },
                    `Error in cleaning up expired links for ${userId}`,
                );
            });
    }

    return mediaId;
}

/** Deletes objects of an upload that won't be kept. Never throws. */
export async function deleteStored(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
        keys.map((Key) => deleteObject({ Key, Bucket: cloudBucket })),
    );
    for (const result of results) {
        if (result.status === "rejected") {
            logger.error(
                { err: result.reason },
                "Failed to delete a rejected upload",
            );
        }
    }
}
