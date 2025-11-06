import logger from "../services/log";
import TusUploadModel, { TusUpload } from "./model";
import { removeTusFiles } from "./utils";

export async function cleanupTUSUploads() {
    logger.info({}, "Starting the tus uploads cleanup job");

    const now = new Date();
    const expiredUploads = (await TusUploadModel.find({
        expiresAt: { $lt: now },
    }).lean()) as unknown as TusUpload[];

    if (expiredUploads.length === 0) {
        logger.info("No expired tus uploads found to cleanup");
        return;
    }

    logger.info(
        { count: expiredUploads.length },
        "Found expired tus uploads to cleanup",
    );

    for (const expiredUpload of expiredUploads) {
        removeTusFiles(expiredUpload.tempFilePath);
        await TusUploadModel.deleteOne({ _id: (expiredUpload as any)._id });
    }

    logger.info(
        { count: expiredUploads.length },
        "Cleaned up expired tus uploads",
    );
}
