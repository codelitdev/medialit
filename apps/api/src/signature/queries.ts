import {
    createSignature,
    deleteExpiredSignatures,
    deleteSignatureById,
    deleteSignatureValue,
    getSignature,
    type ActiveSignatureRecord,
    type SignatureRecord,
} from "@/db";

export type PreSignedUrl = SignatureRecord;

/** The signature, unless its app is deleted or its key revoked. */
export async function getPresignedUrl(
    signature: string,
): Promise<ActiveSignatureRecord | null> {
    return getSignature(signature);
}

export async function deletePresignedUrl(id: string): Promise<void> {
    await deleteSignatureById(id);
}

export async function createPresignedUrl(input: {
    userId: string;
    appId: string;
    apiKeyId?: string;
    group?: string;
}): Promise<PreSignedUrl> {
    return createSignature(input);
}

export async function cleanupExpiredLinks(userId: string): Promise<void> {
    await deleteExpiredSignatures(userId);
}

export async function deleteBySignature(signature: string): Promise<void> {
    await deleteSignatureValue(signature);
}
