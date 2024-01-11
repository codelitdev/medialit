import MediaSettingsModel, { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";

export async function getMediaSettings(
    userId: string,
    apikey: string
): Promise<MediaSettings | null> {
    return await MediaSettingsModel.findOne({ userId, apikey });
}

export async function updateMediaSettings({
    userId,
    apikey,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await MediaSettingsModel.findOneAndUpdate(
        { userId, apikey },
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
