import logger from "../services/log";
import { deleteTusById, getMediaRecord, listExpiredTus } from "@/db";
import { store } from "./tus-server";
import { removeTusBookkeeping } from "./finalize";

/**
 * Removes expired tus uploads. An unfinished one has its S3 multipart upload
 * aborted, so its parts stop costing storage.
 */
export async function cleanupTUSUploads() {
    logger.info({}, "Starting the tus uploads cleanup job");

    const now = new Date();
    const expiredUploads = await listExpiredTus(now);

    if (expiredUploads.length === 0) {
        logger.info("No expired tus uploads found to cleanup");
        return;
    }

    logger.info(
        { count: expiredUploads.length },
        "Found expired tus uploads to cleanup",
    );

    for (const expiredUpload of expiredUploads) {
        try {
            if (!expiredUpload.isComplete) {
                await removeUnfinished(expiredUpload);
            }
            await deleteTusById(expiredUpload.id);
        } catch (err) {
            logger.error(
                { err, uploadId: expiredUpload.uploadId },
                "Error cleaning up tus upload",
            );
        }
    }

    logger.info(
        { count: expiredUploads.length },
        "Cleaned up expired tus uploads",
    );
}

async function removeUnfinished(upload: {
    uploadId: string;
    userId: string;
    appId: string;
    mediaId?: string;
}) {
    // The store's remove() deletes the object at the upload's key too. Never
    // do that once a media record points at it.
    const media = upload.mediaId
        ? await getMediaRecord({
              userId: upload.userId,
              appId: upload.appId,
              mediaId: upload.mediaId,
          })
        : null;
    if (media) {
        await removeTusBookkeeping(upload.uploadId);
        return;
    }
    try {
        await store.remove(upload.uploadId);
    } catch (err: any) {
        // Never started, or already gone.
        if (err?.status_code !== 404) throw err;
        await removeTusBookkeeping(upload.uploadId);
    }
}
