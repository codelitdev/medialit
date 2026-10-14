export const MEDIA_KINDS = ["image", "video", "pdf", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/* The one rule for what kind a file is. mediaKindCondition() in
   db/repository.ts is its SQL twin; keep the two in step. */
export function mediaKind(mimeType: string): MediaKind {
    const type = mimeType.toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.includes("pdf")) return "pdf";
    return "other";
}

export function parseMediaKind(value: unknown): MediaKind | undefined {
    return MEDIA_KINDS.find((kind) => kind === value);
}
