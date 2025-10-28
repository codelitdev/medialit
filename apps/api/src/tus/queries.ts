import logger from "../services/log";
import TusUploadModel, { TusUpload } from "./model";

type TusUploadDocument = any;

export async function createTusUpload(
    data: Omit<TusUpload, "uploadOffset" | "isComplete">,
): Promise<TusUploadDocument> {
    // const uploadId = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date();
    expiresAt.setHours(
        expiresAt.getHours() +
            parseInt(process.env.TUS_UPLOAD_EXPIRATION_HOURS || "48"),
    );

    const tusUploadData: TusUpload = {
        uploadId: data.uploadId,
        userId: data.userId,
        apikey: data.apikey,
        uploadLength: data.uploadLength,
        metadata: data.metadata,
        tempFilePath: data.tempFilePath,
        signature: data.signature,
        uploadOffset: 0,
        isComplete: false,
        expiresAt,
    };
    console.log(
        "Creating TusUpload with ID:",
        data.uploadId,
        data,
        tusUploadData,
    );
    const tusUpload = await TusUploadModel.create(tusUploadData);

    return tusUpload;
}

export async function getTusUpload(
    uploadId: string,
): Promise<TusUploadDocument | null> {
    return TusUploadModel.findOne({ uploadId });
}

// export async function getTusUploadBySignature(
//     signature: string,
// ): Promise<TusUploadDocument | null> {
//     const TusUploadModel = getTusUploadModel();
//     return TusUploadModel.findOne({ signature });
// }

export async function updateTusUploadOffset(
    uploadId: string,
    uploadOffset: number,
): Promise<void> {
    await TusUploadModel.updateOne({ uploadId }, { uploadOffset });
}

export async function markTusUploadComplete(uploadId: string): Promise<void> {
    await TusUploadModel.updateOne({ uploadId }, { isComplete: true });
}

export async function deleteTusUpload(uploadId: string): Promise<void> {
    await TusUploadModel.deleteOne({ uploadId });
}

export async function cleanupExpiredTusUploads(): Promise<void> {
    try {
        const now = new Date();
        const result = await TusUploadModel.deleteMany({
            expiresAt: { $lt: now },
        });
        if (result.deletedCount > 0) {
            logger.info(
                `Cleaned up ${result.deletedCount} expired tus uploads`,
            );
        }
    } catch (err: any) {
        logger.error({ err }, "Error cleaning up expired tus uploads");
    }
}

export async function getTusUploadsByUserId(
    userId: string,
): Promise<TusUploadDocument[]> {
    return TusUploadModel.find({ userId }).sort({ createdAt: -1 });
}
