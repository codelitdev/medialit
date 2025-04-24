import { MediaLit } from "medialit";

export function getMediaLitClient(apiKey: string) {
    return new MediaLit({
        apiKey,
        endpoint: process.env.API_SERVER,
    });
}
