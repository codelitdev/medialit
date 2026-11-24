import type { VideoStreaming } from "./video";

export interface MediaSettings {
    userId: string | undefined;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    /** null: never chosen, which means `off`. */
    videoStreaming?: VideoStreaming | null;
    hlsRenditions?: string[] | null;
}
