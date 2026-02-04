import mongoose from "mongoose";
import { Media } from "./media";
import { Constants } from ".";

export type MediaWithUserId = Media & {
    userId: mongoose.Types.ObjectId;
    temp: boolean;
};
const accessControlOptions = Object.values(Constants.AccessControl);

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
        accessControl: {
            type: String,
            required: true,
            enum: accessControlOptions,
            default: "private",
        },
        group: { type: String },
        caption: { type: String },
        temp: { type: Boolean, default: true },
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
