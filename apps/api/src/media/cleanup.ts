import logger from "../services/log";
import {
    deleteMediaById,
    deleteUploadingMediaRecord,
    listExpiredTempMedia,
    listStaleUploadingMedia,
    type MediaRecord,
} from "@/db";
import { abortMultipartUploads, deleteFolder } from "../services/s3";
import {
    PATH_PREFIX,
    TEMP_MEDIA_EXPIRATION_HOURS,
    UPLOAD_STALE_MINUTES,
    cloudBucket,
} from "../config/constants";
import { Constants } from "@medialit/models";

function privateFolder(mediaId: string): string {
    return `${PATH_PREFIX ? `${PATH_PREFIX}/` : ""}${Constants.PathKey.PRIVATE}/${mediaId}/`;
}

/** Removes what an upload left in the private bucket: unfinished multipart
 * parts (only an abort removes those) and every object in its folder. */
async function removeStoredUpload(media: MediaRecord): Promise<void> {
    const folder = privateFolder(media.mediaId);
    if (!media.uploaded) {
        // Its key is the folder plus the file name recorded when it started.
        await abortMultipartUploads(`${folder}${media.fileName}`, cloudBucket);
    }
    await deleteFolder(folder, cloudBucket);
}

export async function cleanupExpiredTempUploads(): Promise<void> {
    const cutoff = new Date(
        Date.now() - TEMP_MEDIA_EXPIRATION_HOURS * 1000 * 60 * 60,
    );

    try {
        const expired = await listExpiredTempMedia(cutoff);

        if (expired.length === 0) {
            logger.info("No expired temp uploads found to cleanup");
            return;
        }

        logger.info(
            { count: expired.length },
            "Found expired temp uploads to cleanup",
        );

        let count = 0;
        for (const media of expired) {
            try {
                await removeStoredUpload(media);
                await deleteMediaById(media.id);
                count++;
            } catch (err: any) {
                logger.error(
                    { err, mediaId: media.mediaId },
                    "Error cleaning up expired temp upload",
                );
            }
        }
        logger.info({ count }, "Cleaned up expired temp uploads");
    } catch (err: any) {
        logger.error({ err }, "Error in cleanupExpiredTempUploads");
    }
}

/**
 * Releases uploads the server lost mid-way, usually because it crashed: no
 * activity for `UPLOAD_STALE_MINUTES` and no live tus upload to resume them.
 * Frees their reserved storage long before the temp expiry would.
 */
export async function cleanupStaleUploads(): Promise<void> {
    const cutoff = new Date(Date.now() - UPLOAD_STALE_MINUTES * 60 * 1000);
    try {
        const stale = await listStaleUploadingMedia(cutoff);
        if (stale.length === 0) return;

        let count = 0;
        for (const media of stale) {
            try {
                // Row first: if the upload just finished, it isn't ours to
                // remove, and its files must stay.
                if (!(await deleteUploadingMediaRecord(media.mediaId))) {
                    continue;
                }
                await removeStoredUpload(media);
                count++;
            } catch (err: any) {
                logger.error(
                    { err, mediaId: media.mediaId },
                    "Error cleaning up a stale upload",
                );
            }
        }
        logger.info({ count }, "Cleaned up stale uploads");
    } catch (err: any) {
        logger.error({ err }, "Error in cleanupStaleUploads");
    }
}

export default cleanupExpiredTempUploads;
