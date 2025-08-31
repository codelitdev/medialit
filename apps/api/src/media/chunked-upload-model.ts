import mongoose from "mongoose";

export interface ChunkedUpload {
    uploadId: string;
    userId: mongoose.Types.ObjectId;
    apikey: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    totalSize: number;
    totalChunks: number;
    uploadedChunks: number[];
    chunks: Array<{
        chunkNumber: number;
        size: number;
        etag?: string;
        filePath: string;
    }>;
    access: string;
    caption: string;
    group?: string;
    signature?: string;
    createdAt: Date;
    expiresAt: Date;
}

const ChunkedUploadSchema = new mongoose.Schema<ChunkedUpload>({
    uploadId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    apikey: { type: String, required: true },
    fileName: { type: String, required: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    totalSize: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    uploadedChunks: [{ type: Number }],
    chunks: [
        {
            chunkNumber: { type: Number, required: true },
            size: { type: Number, required: true },
            etag: { type: String },
            filePath: { type: String, required: true },
        },
    ],
    access: { type: String, required: true },
    caption: { type: String, default: "" },
    group: { type: String },
    signature: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    }, // 24 hours
});

// Index for cleanup
ChunkedUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ChunkedUploadSchema.index({ userId: 1 });
ChunkedUploadSchema.index({ uploadId: 1 });

export default mongoose.models.ChunkedUpload ||
    mongoose.model("ChunkedUpload", ChunkedUploadSchema);
