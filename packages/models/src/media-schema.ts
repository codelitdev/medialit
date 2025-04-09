import mongoose from "mongoose";
import { Media } from "./media";

export type MediaWithUserId = Media & { userId: mongoose.Types.ObjectId };

const MediaSchema = new mongoose.Schema<MediaWithUserId>(
    {
        fileName: { type: String, required: true },
        mediaId: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        apikey: { type: String, required: true },
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
    },
);

MediaSchema.index({
    originalFileName: "text",
    caption: "text",
});

export default MediaSchema;
