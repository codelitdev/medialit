import type { VideoStreaming } from "./video";

export interface MediaSettings {
    userId: string | undefined;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    videoStreaming?: VideoStreaming | null;
    hlsRenditions?: string[] | null;
}
