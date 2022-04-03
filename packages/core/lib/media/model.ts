import mongoose from "mongoose";

export interface Media {
    mediaId: string;
    userId: mongoose.Types.ObjectId;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: string;
    group?: string;
    caption?: string;
}

const MediaSchema = new mongoose.Schema<Media>(
    {
        mediaId: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        originalFileName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        thumbnailGenerated: { type: Boolean, required: true, default: false },
        accessControl: { type: String, required: true, default: "private" },
        group: { type: String },
        caption: { type: String },
    },
    {
        timestamps: true,
    }
);

MediaSchema.index({
    originalFileName: "text",
    caption: "text",
});

export default mongoose.models.Media || mongoose.model("Media", MediaSchema);
