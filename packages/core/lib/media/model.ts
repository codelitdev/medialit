import mongoose from 'mongoose';

export interface Media {
    originalFileName: string;
    mediaId: string;
    mimeType: string;
    size: number;
    userId: mongoose.Types.ObjectId;
    thumbnailGenerated: boolean;
    accessControl?: string;
    caption?: string;
}

const MediaSchema = new mongoose.Schema<Media>(
  {
    mediaId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    accessControl: { type: String, required: true, default: "private" },
    thumbnailGenerated: { type: Boolean, required: true, default: false },
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