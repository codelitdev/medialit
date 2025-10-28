import type { Media } from "@medialit/models";
import mongoose from "mongoose";

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

const TusUploadSchema = new mongoose.Schema<TusUpload>(
    {
        uploadId: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        apikey: { type: String, required: true },
        uploadLength: { type: Number, required: true },
        uploadOffset: { type: Number, required: true, default: 0 },
        metadata: {
            fileName: { type: String, required: true },
            mimeType: { type: String, required: true },
            accessControl: { type: String, required: true, default: "private" },
            caption: String,
            group: String,
        },
        signature: String,
        tempFilePath: String,
        isComplete: Boolean,
        expiresAt: Date,
    },
    { timestamps: true },
);

export default mongoose.models.TusUpload ||
    mongoose.model("TusUpload", TusUploadSchema);
