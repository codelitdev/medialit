import type { PresignedUrlRow } from "@medialit/db";
import { getUniqueId } from "@medialit/utils";
import {
    SIGNATURE_LENGTH,
    SIGNATURE_VALIDITY_MINUTES,
} from "../config/constants";
import getRepositories from "../config/repositories";

export type PreSignedUrl = PresignedUrlRow;

export async function getPresignedUrl(
    signature: string,
): Promise<PreSignedUrl | null> {
    return await getRepositories().presignedUrls.findBySignature(signature);
}

export async function deletePresignedUrl(id: string): Promise<void> {
    await getRepositories().presignedUrls.deleteById(id);
}

export async function createPresignedUrl(
    userId: string,
    apikey: string,
    group?: string,
): Promise<PreSignedUrl> {
    return await getRepositories().presignedUrls.create({
        userId,
        apikey,
        group,
        signature: getUniqueId(SIGNATURE_LENGTH),
        validTill: new Date(Date.now() + SIGNATURE_VALIDITY_MINUTES * 60000),
    });
}

export async function cleanupExpiredLinks(userId: string): Promise<void> {
    await getRepositories().presignedUrls.deleteExpiredByUserId(
        userId,
        new Date(),
    );
}

export async function deleteBySignature(signature: string): Promise<void> {
    await getRepositories().presignedUrls.deleteBySignature(signature);
}
