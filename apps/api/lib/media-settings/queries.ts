import MediaSettingsModel, { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";

export async function getMediaSettings(
    userId: string
): Promise<MediaSettings | null> {
    return await MediaSettingsModel.findOne({ userId });
}

export async function updateMediaSettings({
    userId,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await MediaSettingsModel.findOneAndUpdate(
        { userId },
        {
            $set: {
                useWebP,
                webpOutputQuality,
                thumbnailWidth,
                thumbnailHeight,
            },
        },
        { upsert: true }
    );
}
