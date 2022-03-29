import MediaSettingsModel, { MediaSettings } from "./model"

export async function getMediaSettings(userId: string): Promise<MediaSettings | null> {
    return await MediaSettingsModel.findOne({ userId });
}