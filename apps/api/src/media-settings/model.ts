export interface MediaSettings {
    userId: string | undefined;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
}
