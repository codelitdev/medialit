import type { NewTusUploadRow, TusUploadRow } from "@medialit/db";
import { SIGNATURE_VALIDITY_MINUTES } from "../config/constants";
import getRepositories from "../config/repositories";

export type TusUpload = TusUploadRow;

export async function createTusUpload(
    data: Omit<NewTusUploadRow, "uploadOffset" | "isComplete">,
): Promise<TusUpload> {
    const expiresAt = new Date();
    const signatureValidityHours = SIGNATURE_VALIDITY_MINUTES / 60;
    expiresAt.setHours(expiresAt.getHours() + signatureValidityHours);

    return await getRepositories().tusUploads.create({
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
    });
}

export async function getTusUpload(
    uploadId: string,
): Promise<TusUpload | null> {
    return await getRepositories().tusUploads.findByUploadId(uploadId);
}

export async function updateTusUploadOffset(
    uploadId: string,
    uploadOffset: number,
): Promise<void> {
    await getRepositories().tusUploads.updateOffset(uploadId, uploadOffset);
}

export async function markTusUploadComplete(uploadId: string): Promise<void> {
    await getRepositories().tusUploads.markComplete(uploadId);
}

export async function deleteTusUpload(uploadId: string): Promise<void> {
    await getRepositories().tusUploads.deleteByUploadId(uploadId);
}

export async function getTusUploadsByUserId(
    userId: string,
): Promise<TusUpload[]> {
    return await getRepositories().tusUploads.findByUserId(userId);
}
