export type AccessControl = "private" | "public";

export interface Media {
    fileName: string;
    mediaId: string;
    apikey: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: AccessControl;
    group?: string;
    caption?: string;
    file?: string;
    temp?: boolean;
}
