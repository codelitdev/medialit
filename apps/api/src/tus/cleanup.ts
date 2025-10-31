import logger from "../services/log";
import TusUploadModel, { TusUpload } from "./model";
import { removeTusFiles } from "./utils";

export async function Cleanup() {
    logger.info({}, "Starting the tus uploads cleanup job");

    const now = new Date();
    const expiredUploads = (await TusUploadModel.find({
        expiresAt: { $lt: now },
    }).lean()) as unknown as TusUpload[];

    for (const expiredUpload of expiredUploads) {
        removeTusFiles(expiredUpload.tempFilePath);
        await TusUploadModel.deleteOne({ _id: (expiredUpload as any)._id });
    }

    logger.info({}, "Ending the tus uploads cleanup job");
}
