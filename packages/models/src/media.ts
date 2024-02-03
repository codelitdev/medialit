export interface Media {
    fileName: string;
    mediaId: string;
    apikey: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: string;
    group?: string;
    caption?: string;
}
