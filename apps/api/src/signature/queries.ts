import {
    createSignature,
    deleteExpiredSignatures,
    deleteSignatureById,
    deleteSignatureValue,
    getSignature,
} from "@/db";

export interface PreSignedUrl {
    id: string;
    userId: string;
    apikey: string;
    signature: string;
    validTill: Date;
    group?: string;
}

export async function getPresignedUrl(
    signature: string,
): Promise<PreSignedUrl | null> {
    return getSignature(signature);
}

export async function deletePresignedUrl(id: string): Promise<void> {
    await deleteSignatureById(id);
}

export async function createPresignedUrl(
    userId: string,
    apikey: string,
    group?: string,
): Promise<PreSignedUrl> {
    return createSignature({ userId, apikey, group });
}

export async function cleanupExpiredLinks(userId: string): Promise<void> {
    await deleteExpiredSignatures(userId);
}

export async function deleteBySignature(signature: string): Promise<void> {
    await deleteSignatureValue(signature);
}
