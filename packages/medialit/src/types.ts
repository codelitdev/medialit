export type AccessControl = "private" | "public";

export interface Media {
    fileName: string;
    mediaId: string;
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
    /** Outputs made from the original, by name (`thumbnail`; `poster`,
     * `hls` and others later). `url` is set once a derivative is ready. */
    derivatives?: Record<string, MediaDerivative>;
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
