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
    /** Background processing of sealed media: `pending` until seal. */
    processing?: MediaProcessing;
    /** Outputs made from the original, by name (`thumbnail`, `mp4`,
     * `hls`). `url` is set once a derivative is ready. */
    derivatives?: Record<string, MediaDerivative>;
    /** Duration, size, codecs and format, read at seal. Null before seal,
     * or when the file couldn't be read. Missing on older servers. */
    metadata?: MediaMetadata | null;
}

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export interface MediaProcessing {
    status: ProcessingStatus;
    error?: string;
}

export interface MediaDerivative {
    status: "queued" | "processing" | "ready" | "failed";
    url?: string;
    mimeType?: string;
    size?: number;
    error?: string;
}

/** Technical metadata, read when the media is sealed. Fields that don't
 * apply are left out. Width and height are as displayed. */
export interface MediaMetadata {
    kind: "video" | "audio" | "image";
    durationSeconds?: number;
    width?: number;
    height?: number;
    rotation?: 0 | 90 | 180 | 270;
    frameRate?: number;
    videoCodec?: string;
    audioCodec?: string;
    /** Bits per second, the whole file. */
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    /** The container or image format. */
    format?: string;
}
