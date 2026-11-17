import path from "path";

/* Files the dashboard can show in a native viewer instead of the generic
   preview. The web app picks a viewer by this name, so adding a viewer means
   adding a name here and a matching viewer there. */
export const MEDIA_PREVIEWS = ["markdown"] as const;
export type MediaPreview = (typeof MEDIA_PREVIEWS)[number];

/* Text viewers load the whole file, so they stop at this size. */
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const MARKDOWN_MIME_TYPES = new Set(["text/markdown", "text/x-markdown"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);

/* Browsers often upload markdown as text/plain or octet-stream, so the file
   name decides when the MIME type is that vague. */
const VAGUE_MIME_TYPES = new Set([
    "",
    "text/plain",
    "application/octet-stream",
]);

export function mediaPreview(
    mimeType: string,
    fileName: string,
): MediaPreview | null {
    const type = mimeType.toLowerCase().split(";")[0].trim();
    const extension = path.extname(fileName).toLowerCase();
    if (MARKDOWN_MIME_TYPES.has(type)) return "markdown";
    if (VAGUE_MIME_TYPES.has(type) && MARKDOWN_EXTENSIONS.has(extension)) {
        return "markdown";
    }
    return null;
}

/* Every current preview reads the file as text. */
export function isTextPreview(preview: MediaPreview | null): boolean {
    return preview === "markdown";
}
