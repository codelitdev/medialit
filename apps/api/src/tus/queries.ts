import { SIGNATURE_VALIDITY_MINUTES } from "../config/constants";
import type { Media } from "@medialit/models";
import {
    createTusUploadRecord,
    deleteTusUploadRecord,
    getTusUploadRecord,
    listTusByUser,
    markTusComplete,
    type TusUploadRecord,
} from "@/db";

/**
 * What MediaLit itself keeps about a tus upload. Resume bookkeeping (offsets,
 * parts) lives with the S3 store, in a `.info` object next to the file.
 */
export interface TusUpload {
    /** Also the object's key in the private bucket. */
    uploadId: string;
    mediaId: string;
    userId: string;
    appId: string;
    uploadLength: number;
    metadata: Pick<
        Media,
        "fileName" | "mimeType" | "accessControl" | "caption" | "group"
    >;
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

function toTusUpload(row: TusUploadRecord): TusUpload {
    return {
        uploadId: row.uploadId,
        mediaId: row.mediaId || "",
        userId: row.userId,
        appId: row.appId,
        uploadLength: row.uploadLength,
        metadata: toTusMetadata(row.metadata),
        isComplete: row.isComplete,
        expiresAt: row.expiresAt,
        signature: row.signature,
    };
}

export async function createTusUpload(
    data: Omit<TusUpload, "isComplete" | "expiresAt">,
): Promise<TusUpload> {
    const expiresAt = new Date();
    const signatureValidityHours = SIGNATURE_VALIDITY_MINUTES / 60;
    expiresAt.setHours(expiresAt.getHours() + signatureValidityHours);
    const created = await createTusUploadRecord({
        uploadId: data.uploadId,
        mediaId: data.mediaId,
        userId: data.userId,
        appId: data.appId,
        uploadLength: data.uploadLength,
        metadata: {
            fileName: data.metadata.fileName,
            mimeType: data.metadata.mimeType,
            accessControl: data.metadata.accessControl,
            caption: data.metadata.caption,
            group: data.metadata.group,
        },
        signature: data.signature,
        expiresAt,
    });
    return toTusUpload(created);
}

export async function getTusUpload(
    uploadId: string,
): Promise<TusUpload | null> {
    const row = await getTusUploadRecord(uploadId);
    return row ? toTusUpload(row) : null;
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
    return rows.map(toTusUpload);
}
