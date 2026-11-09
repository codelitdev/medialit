import logger from "../services/log";
import { cloudBucket } from "../config/constants";
import { deleteObject } from "../services/s3";
import { finalizeStoredUpload, parseUploadKey } from "../media/ingest";
import { getTusUpload, markTusUploadComplete } from "./queries";

/**
 * Finishes a tus upload once all of its bytes are in S3. The S3 store has
 * already completed the multipart upload at the final key; this runs the
 * shared processing and removes tus's bookkeeping objects.
 */
export default async function finalizeUpload(
    uploadId: string,
): Promise<string> {
    const tusUpload = await getTusUpload(uploadId);
    if (!tusUpload) {
        throw new Error(`Tus upload not found: ${uploadId}`);
    }

    if (tusUpload.isComplete) {
        logger.info({ uploadId }, "Upload already finalized");
        return tusUpload.mediaId;
    }

    const target = parseUploadKey(uploadId);
    if (!target || target.mediaId !== tusUpload.mediaId) {
        throw new Error(`Invalid tus upload key: ${uploadId}`);
    }

    const { userId, appId, metadata, signature } = tusUpload;
    try {
        await finalizeStoredUpload({
            ...target,
            userId,
            appId,
            originalFileName: metadata.fileName,
            mimeType: metadata.mimeType,
            access: metadata.accessControl,
            caption: metadata.caption,
            group: metadata.group,
            signature,
        });
        await markTusUploadComplete(uploadId);
    } finally {
        await removeTusBookkeeping(uploadId);
    }

    return target.mediaId;
}

/** Deletes the `.info` and `.part` objects the S3 store keeps per upload. */
export async function removeTusBookkeeping(uploadId: string): Promise<void> {
    await Promise.allSettled(
        [`${uploadId}.info`, `${uploadId}.part`].map((Key) =>
            deleteObject({ Key, Bucket: cloudBucket }),
        ),
    );
}
