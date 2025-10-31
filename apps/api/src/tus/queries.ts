import { SIGNATURE_VALIDITY_MINUTES } from "../config/constants";
import TusUploadModel, { TusUpload } from "./model";

type TusUploadDocument = any;

export async function createTusUpload(
    data: Omit<TusUpload, "uploadOffset" | "isComplete">,
): Promise<TusUploadDocument> {
    const expiresAt = new Date();
    const signatureValidityHours = SIGNATURE_VALIDITY_MINUTES / 60;
    expiresAt.setHours(expiresAt.getHours() + signatureValidityHours);

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
    const tusUpload = await TusUploadModel.create(tusUploadData);

    return tusUpload;
}

export async function getTusUpload(
    uploadId: string,
): Promise<TusUploadDocument | null> {
    return TusUploadModel.findOne({ uploadId });
}

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

export async function getTusUploadsByUserId(
    userId: string,
): Promise<TusUploadDocument[]> {
    return TusUploadModel.find({ userId }).sort({ createdAt: -1 });
}
