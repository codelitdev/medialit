import mongoose from "mongoose";
import PreSignedUrlModel, { PreSignedUrl } from "./model";

export async function getPresignedUrl(
    signature: string
): Promise<PreSignedUrl | null> {
    return await PreSignedUrlModel.findOne({ signature });
}

export async function deletePresignedUrl(
    id: mongoose.Types.ObjectId
): Promise<void> {
    await PreSignedUrlModel.deleteOne({ id });
}

export async function createPresignedUrl(
    userId: string,
    group?: string
): Promise<PreSignedUrl> {
    const presignedUrl = await PreSignedUrlModel.create({ userId, group });
    return presignedUrl;
}

export async function cleanupExpiredLinks(userId: string): Promise<void> {
    await PreSignedUrlModel.deleteMany({
        userId,
        validTill: { $lt: new Date().getTime() },
    });
}

export async function deleteBySignature(signature: string): Promise<void> {
    await PreSignedUrlModel.deleteOne({ signature });
}
