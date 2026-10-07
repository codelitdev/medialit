import logger from "../services/log";
import { deleteTusById, listExpiredTus } from "@/db";
import { removeTusFiles } from "./utils";

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
        if (expiredUpload.tempFilePath) {
            removeTusFiles(expiredUpload.tempFilePath);
        }
        await deleteTusById(expiredUpload.id);
    }

    logger.info(
        { count: expiredUploads.length },
        "Cleaned up expired tus uploads",
    );
}
