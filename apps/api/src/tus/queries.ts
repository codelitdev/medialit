import { SIGNATURE_VALIDITY_MINUTES } from "../config/constants";
import type { Media } from "@medialit/models";
import {
    createTusUploadRecord,
    deleteTusUploadRecord,
    getTusUploadRecord,
    listTusByUser,
    markTusComplete,
    updateTusOffset,
} from "@/db";

export interface TusUpload {
    uploadId: string;
    userId: string;
    apikey: string;
    uploadLength: number;
    uploadOffset: number;
    metadata: Pick<
        Media,
        "fileName" | "mimeType" | "accessControl" | "caption" | "group"
    >;
    tempFilePath: string;
    isComplete: boolean;
    expiresAt?: Date;
    signature?: string;
}

function toTusMetadata(metadata: {
    fileName: string;
    mimeType: string;
    accessControl: string;
    caption?: string;
    group?: string;
}): TusUpload["metadata"] {
    return {
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        accessControl:
            metadata.accessControl === "public" ? "public" : "private",
        caption: metadata.caption,
        group: metadata.group,
    };
}

export async function createTusUpload(
    data: Omit<TusUpload, "uploadOffset" | "isComplete">,
): Promise<TusUpload> {
    const expiresAt = new Date();
    const signatureValidityHours = SIGNATURE_VALIDITY_MINUTES / 60;
    expiresAt.setHours(expiresAt.getHours() + signatureValidityHours);
    const created = await createTusUploadRecord({
        uploadId: data.uploadId,
        userId: data.userId,
        apikey: data.apikey,
        uploadLength: data.uploadLength,
        metadata: {
            fileName: data.metadata.fileName,
            mimeType: data.metadata.mimeType,
            accessControl: data.metadata.accessControl,
            caption: data.metadata.caption,
            group: data.metadata.group,
        },
        tempFilePath: data.tempFilePath,
        signature: data.signature,
        expiresAt,
    });
    return {
        uploadId: created.uploadId,
        userId: created.userId,
        apikey: created.apikey,
        uploadLength: created.uploadLength,
        uploadOffset: created.uploadOffset,
        metadata: toTusMetadata(created.metadata),
        tempFilePath: created.tempFilePath || "",
        isComplete: created.isComplete,
        expiresAt: created.expiresAt,
        signature: created.signature,
    };
}

export async function getTusUpload(
    uploadId: string,
): Promise<TusUpload | null> {
    const row = await getTusUploadRecord(uploadId);
    if (!row) return null;
    return {
        uploadId: row.uploadId,
        userId: row.userId,
        apikey: row.apikey,
        uploadLength: row.uploadLength,
        uploadOffset: row.uploadOffset,
        metadata: toTusMetadata(row.metadata),
        tempFilePath: row.tempFilePath || "",
        isComplete: row.isComplete,
        expiresAt: row.expiresAt,
        signature: row.signature,
    };
}

export async function updateTusUploadOffset(
    uploadId: string,
    uploadOffset: number,
): Promise<void> {
    await updateTusOffset(uploadId, uploadOffset);
}

export async function markTusUploadComplete(uploadId: string): Promise<void> {
    await markTusComplete(uploadId);
}

export async function deleteTusUpload(uploadId: string): Promise<void> {
    await deleteTusUploadRecord(uploadId);
}

export async function getTusUploadsByUserId(
    userId: string,
): Promise<TusUpload[]> {
    const rows = await listTusByUser(userId);
    return rows.map((row) => ({
        uploadId: row.uploadId,
        userId: row.userId,
        apikey: row.apikey,
        uploadLength: row.uploadLength,
        uploadOffset: row.uploadOffset,
        metadata: toTusMetadata(row.metadata),
        tempFilePath: row.tempFilePath || "",
        isComplete: row.isComplete,
        expiresAt: row.expiresAt,
        signature: row.signature,
    }));
}
