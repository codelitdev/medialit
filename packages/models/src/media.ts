import { AccessControl } from "./access-control";

export interface Media {
    fileName: string;
    mediaId: string;
    apikey: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    thumbnailGenerated: boolean;
    accessControl: AccessControl;
    group?: string | null;
    caption?: string | null;
    file?: string;
    temp?: boolean | null;
}
