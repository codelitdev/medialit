import os from "os";
import path from "path";
import { mkdtemp, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import thumbnail from "@medialit/thumbnail";
import imageUtils from "@medialit/images";
import { Constants, type MediaWithUserId } from "@medialit/models";
import {
    cloudBucket,
    imagePattern,
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
import logger from "../services/log";
import { getMediaSettings } from "../media-settings/queries";
import * as presignedUrlService from "../signature/service";
import generateFileName from "./utils/generate-file-name";
import generateKey from "./utils/generate-key";
import getTags from "./utils/get-tags";
import { createMedia } from "./queries";
import { hasEnoughStorage } from "./storage-middleware";

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

export interface StoredUpload extends UploadTarget {
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
 * 1. Converts images to WebP when the app asks for it, replacing the original.
 * 2. Checks storage again with the size actually stored.
 * 3. Makes a thumbnail. Videos are read through a presigned URL, so only the
 *    bytes ffmpeg needs are fetched.
 * 4. Creates the temporary media record.
 *
 * If any step but the thumbnail fails, every object it stored is deleted, so
 * a rejected upload leaves nothing behind.
 */
export async function finalizeStoredUpload(
    upload: StoredUpload,
): Promise<string> {
    const { mediaId, ext, key, userId, appId } = upload;
    const tags = getTags(userId, upload.group);
    const stored = new Set<string>([key]);
    const workDir = await mkdtemp(
        path.join(tempFileDirForUploads || os.tmpdir(), "medialit-finalize-"),
    );

    try {
        const settings = await getMediaSettings(userId, appId);
        const convertToWebp =
            Boolean(settings?.useWebP) && imagePattern.test(upload.mimeType);
        const isImage = imagePatternForThumbnailGeneration.test(
            upload.mimeType,
        );
        const isVideo = videoPattern.test(upload.mimeType);

        // Images are small; read them back for WebP and the thumbnail.
        let localPath: string | undefined;
        if (convertToWebp || isImage) {
            localPath = path.join(workDir, "source");
            await downloadObject({ Key: key, destination: localPath });
        }

        let fileName = `main.${ext}`;
        let mimeType = upload.mimeType;
        let size: number;
        if (convertToWebp && localPath) {
            await imageUtils.convertToWebp(
                localPath,
                settings?.webpOutputQuality || 0,
            );
            const webpKey = mainKey(mediaId, "webp");
            await putObject({
                Key: webpKey,
                Body: createReadStream(localPath),
                ContentType: "image/webp",
                Tagging: tags,
                Bucket: cloudBucket,
            });
            stored.add(webpKey);
            if (webpKey !== key) {
                await deleteObject({ Key: key, Bucket: cloudBucket });
                stored.delete(key);
            }
            fileName = "main.webp";
            mimeType = "image/webp";
            size = (await stat(localPath)).size;
        } else {
            const head = await headObject({ Key: key, Bucket: cloudBucket });
            size = head.ContentLength ?? 0;
            await putObjectTagging({ Key: key, Tagging: tags });
        }

        // Counts unsealed uploads too, so concurrent uploads can't overrun.
        if (!(await hasEnoughStorage(size, { _id: userId } as any))) {
            throw new Error(NOT_ENOUGH_STORAGE);
        }

        let thumbnailGenerated = false;
        if (isImage || isVideo) {
            const thumbKey = generateKey({
                mediaId,
                path: Constants.PathKey.PRIVATE,
                filename: "thumb.webp",
            });
            const thumbPath = path.join(workDir, "thumb.webp");
            try {
                if (isImage && localPath) {
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
            } catch (err: any) {
                logger.error({ err, mediaId }, "Failed to generate thumbnail");
            }
        }

        const media: MediaWithUserId = {
            fileName,
            mediaId,
            userId,
            appId,
            originalFileName: upload.originalFileName,
            mimeType,
            size,
            thumbnailGenerated,
            caption: upload.caption,
            accessControl:
                upload.access === Constants.AccessControl.PUBLIC
                    ? Constants.AccessControl.PUBLIC
                    : Constants.AccessControl.PRIVATE,
            group: upload.group,
            temp: true,
        };
        await createMedia(media);
    } catch (err) {
        await deleteStored([...stored]);
        throw err;
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }

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
