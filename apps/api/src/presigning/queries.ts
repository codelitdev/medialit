import mongoose from "mongoose";
import PreSignedUrlModel, { PreSignedUrl } from "./model";
import { getUniqueId } from "@medialit/utils";
import { PRESIGNED_URL_LENGTH, PRESIGNED_URL_VALIDITY_MINUTES } from "../config/constants";

export async function getPresignedUrl(
    signature: string,
): Promise<PreSignedUrl | null> {
    return await PreSignedUrlModel.findOne({ signature });
}

export async function deletePresignedUrl(
    id: mongoose.Types.ObjectId,
): Promise<void> {
    await PreSignedUrlModel.deleteOne({ id });
}

export async function createPresignedUrl(
    userId: string,
    apikey: string,
    group?: string,
    validityMinutes?: number,
): Promise<PreSignedUrl | undefined> {
    const validity = validityMinutes || PRESIGNED_URL_VALIDITY_MINUTES;
    const validTill = new Date(new Date().getTime() + validity * 60000);
    
    const presignedUrl = await PreSignedUrlModel.create({
        userId,
        apikey,
        group,
        validTill,
    });
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
