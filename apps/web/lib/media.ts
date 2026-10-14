export type MediaListItem = {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    /** Set by the API; the same kinds the Files filters use. */
    kind: "image" | "video" | "pdf" | "other";
    size: number;
    access: "public" | "private";
    thumbnail: string;
    createdAt: string;
    caption?: string;
    group?: string;
};
