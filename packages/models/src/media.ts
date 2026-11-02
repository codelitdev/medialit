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
    /** Client-chosen ID of the source asset; unique per app. */
    assetId?: string;
    /** When the content was captured, as reported by the client. */
    takenAt?: Date;
    width?: number;
    height?: number;
    durationMs?: number;
    /** The thumbnail is in the private bucket, behind a signed URL. */
    thumbnailPrivate?: boolean;
}
