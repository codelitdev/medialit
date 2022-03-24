import mongoose from 'mongoose';

export interface MediaSettings {
    userId: mongoose.Types.ObjectId | undefined;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
}

const MediaSettingsSchema = new mongoose.Schema<MediaSettings>({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    useWebP: Boolean,
    webpOutputQuality: Number,
    thumbnailWidth: Number,
    thumbnailHeight: Number
})

export default mongoose.models.MediaSettings || mongoose.model("MediaSettings", MediaSettingsSchema);