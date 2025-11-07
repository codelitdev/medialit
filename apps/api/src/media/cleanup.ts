import logger from "../services/log";
import MediaModel from "./model";
import { deleteFolder } from "../services/s3";
import {
    PATH_PREFIX,
    TEMP_MEDIA_EXPIRATION_HOURS,
    cloudBucket,
} from "../config/constants";
import { PATH_KEY } from "./utils/generate-key";

export async function cleanupExpiredTempUploads(): Promise<void> {
    const cutoff = new Date(
        Date.now() - TEMP_MEDIA_EXPIRATION_HOURS * 1000 * 60 * 60,
    );

    try {
        const expired = await MediaModel.find({
            temp: true,
            createdAt: { $lt: cutoff },
        }).lean();

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
                // Delete S3 objects from private bucket (using private path prefix)
                const tmpPrefix = `${PATH_PREFIX ? `${PATH_PREFIX}/` : ""}${PATH_KEY.PRIVATE}/${media.mediaId}/`;
                await deleteFolder(tmpPrefix, cloudBucket);

                // Delete media record
                await MediaModel.deleteOne({ _id: media._id });
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

export default cleanupExpiredTempUploads;
