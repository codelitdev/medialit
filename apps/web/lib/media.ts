/** Native viewers the API can name. Each has a viewer in
    app/app/[appId]/files/file-preview/viewers. */
export type MediaPreview = "markdown";

export type MediaListItem = {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    /** Set by the API; the same kinds the Files filters use. */
    kind: "image" | "video" | "pdf" | "other";
    /** Set by the API: the native viewer that can open this file, if any. */
    preview?: MediaPreview | null;
    size: number;
    access: "public" | "private";
    thumbnail: string;
    createdAt: string;
    caption?: string;
    group?: string;
};
