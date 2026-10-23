import { AccessControl } from "./access-control";

export interface Media {
    fileName: string;
    mediaId: string;
    /** Internal ID of the app the media belongs to. */
    appId: string;
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
