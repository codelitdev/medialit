export type MediaListItem = {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: "public" | "private";
    thumbnail: string;
    createdAt: string;
    caption?: string;
    group?: string;
};
