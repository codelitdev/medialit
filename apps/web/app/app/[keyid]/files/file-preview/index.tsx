"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Checkbox } from "@codelitdev/design-system";
import {
    FileArchive,
    FileAudio,
    FileCode2,
    FileImage,
    FileText,
    FileVideo,
    File as FileIcon,
    Globe,
    LockKeyhole,
} from "lucide-react";
import { Loader } from "@codelitdev/design-system";
import type { MediaListItem } from "@/lib/media";
import { formatFileSize, formatRelativeUpload } from "@/lib/media-format";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import FileInteractivity from "./file-interactivity";
import { useFileUrl } from "./use-file-url";

/* The API decides each file's kind; these are just its labels. */
const kindLabels: Record<MediaListItem["kind"], string> = {
    image: "Image",
    video: "Video",
    pdf: "PDF",
    other: "File",
};

export function FileTypeIcon({ mimeType }: { mimeType: string }) {
    if (mimeType.startsWith("image/")) return <FileImage aria-hidden="true" />;
    if (mimeType.startsWith("video/")) return <FileVideo aria-hidden="true" />;
    if (mimeType.startsWith("audio/")) return <FileAudio aria-hidden="true" />;
    if (mimeType === "application/pdf") return <FileText aria-hidden="true" />;
    if (/zip|rar|tar|gzip/.test(mimeType))
        return <FileArchive aria-hidden="true" />;
    if (/json|javascript|xml|text/.test(mimeType))
        return <FileCode2 aria-hidden="true" />;
    return <FileIcon aria-hidden="true" />;
}

/* Shows the real file once its URL has loaded. Until then, or for types we
   cannot render inline, it falls back to the thumbnail or a type icon. */
function FilePreviewMedia({
    media,
    fileUrl,
    loadError,
}: {
    media: MediaListItem;
    fileUrl: string;
    loadError: boolean;
}) {
    if (!fileUrl && !loadError) {
        return (
            <span className="file-dialog-loading" role="status">
                <Loader product="medialit" size={96} />
                <span className="visually-hidden">Loading preview</span>
            </span>
        );
    }

    if (fileUrl) {
        if (media.mimeType.startsWith("image/")) {
            return (
                <Image
                    src={fileUrl}
                    alt={media.originalFileName}
                    fill
                    className="object-contain"
                    unoptimized
                />
            );
        }
        if (media.mimeType.startsWith("video/")) {
            return (
                <video
                    className="file-dialog-media"
                    src={fileUrl}
                    controls
                    preload="metadata"
                />
            );
        }
        if (media.mimeType.startsWith("audio/")) {
            return (
                <div className="file-dialog-audio">
                    <FileAudio aria-hidden="true" />
                    <audio src={fileUrl} controls preload="metadata" />
                </div>
            );
        }
        if (media.mimeType === "application/pdf") {
            return (
                <iframe
                    className="file-dialog-media"
                    src={fileUrl}
                    title={`Preview of ${media.originalFileName}`}
                />
            );
        }
    }

    if (media.thumbnail) {
        return (
            <Image
                src={media.thumbnail}
                alt={media.originalFileName}
                fill
                className="object-contain"
                unoptimized
            />
        );
    }
    return (
        <span className="file-type-icon">
            <FileTypeIcon mimeType={media.mimeType} />
        </span>
    );
}

/* Dialog body. Mounted only while the dialog is open, so the file URL is
   fetched each time the details are opened. */
function FileDetailsContent({
    media,
    keyid,
}: {
    media: MediaListItem;
    keyid: string;
}) {
    const { url, error } = useFileUrl(keyid, media.mediaId);
    const kind = kindLabels[media.kind];
    const fileLabel =
        media.originalFileName.split(".").at(-1)?.toUpperCase() || kind;
    const isPublic = media.access !== "private";

    return (
        <>
            <DialogTitle className="file-dialog-title">
                File details
            </DialogTitle>
            <div className="file-dialog-preview">
                <FilePreviewMedia
                    media={media}
                    fileUrl={url}
                    loadError={error}
                />
                <span className="file-preview-caption">{fileLabel}</span>
            </div>
            <div className="file-dialog-body">
                <div>
                    <h3 className="file-dialog-name">
                        {media.originalFileName}
                    </h3>
                    <div className="file-dialog-badges">
                        <span className="file-badge">{kind}</span>
                        <span
                            className={`file-badge${isPublic ? " is-public" : ""}`}
                        >
                            {isPublic ? "Public" : "Private"}
                        </span>
                    </div>
                </div>
                <dl className="file-dialog-facts">
                    <div>
                        <dt>Size</dt>
                        <dd className="mono">
                            {formatFileSize(media.size)} (
                            {media.size.toLocaleString()} bytes)
                        </dd>
                    </div>
                    <div>
                        <dt>MIME type</dt>
                        <dd className="mono">{media.mimeType}</dd>
                    </div>
                    <div>
                        <dt>Uploaded</dt>
                        <dd>{formatRelativeUpload(media.createdAt)}</dd>
                    </div>
                    <div>
                        <dt>File ID</dt>
                        <dd className="mono">{media.mediaId}</dd>
                    </div>
                </dl>
                <FileInteractivity
                    media={media}
                    fileUrl={url}
                    loadError={error}
                />
            </div>
        </>
    );
}

/* The details dialog shared by grid cards and table rows. */
function FileDetailsDialog({
    media,
    keyid,
    children,
}: {
    media: MediaListItem;
    keyid: string;
    children: ReactNode;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="file-dialog sm:max-w-[960px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0">
                <FileDetailsContent media={media} keyid={keyid} />
            </DialogContent>
        </Dialog>
    );
}

export default function FilePreview({
    media,
    keyid,
    layout = "grid",
    selected,
    onSelectionChange,
}: {
    media: MediaListItem;
    keyid: string;
    layout?: "grid" | "list";
    selected: boolean;
    onSelectionChange: () => void;
}) {
    const kind = kindLabels[media.kind];
    const fileLabel =
        media.originalFileName.split(".").at(-1)?.toUpperCase() || kind;
    const preview = media.thumbnail ? (
        <Image
            src={media.thumbnail}
            alt={media.originalFileName}
            fill
            sizes={
                layout === "list" ? "62px" : "(max-width: 760px) 50vw, 240px"
            }
            className="object-cover"
            unoptimized
        />
    ) : (
        <span className="file-type-icon" data-kind={kind.toLowerCase()}>
            <FileTypeIcon mimeType={media.mimeType} />
        </span>
    );

    return (
        <div className={`file-card-shell${selected ? " is-selected" : ""}`}>
            <FileDetailsDialog media={media} keyid={keyid}>
                <button
                    type="button"
                    className="file-card"
                    aria-label={`${media.originalFileName}, ${kind}, ${formatFileSize(media.size)}`}
                >
                    <span className="file-preview-area">
                        {preview}
                        <span className="file-preview-caption">
                            {fileLabel}
                        </span>
                        {media.access === "private" ? (
                            <span
                                className="file-card-private"
                                aria-label="Private"
                                title="Private"
                            >
                                <LockKeyhole aria-hidden="true" />
                            </span>
                        ) : null}
                    </span>
                    <span className="file-card-copy">
                        <strong>{media.originalFileName}</strong>
                        <span>
                            {kind} · {formatFileSize(media.size)} ·{" "}
                            {formatRelativeUpload(media.createdAt)}
                        </span>
                    </span>
                </button>
            </FileDetailsDialog>
            <div className="file-select-control">
                <Checkbox
                    checked={selected}
                    label={
                        <span className="visually-hidden">
                            Select {media.originalFileName}
                        </span>
                    }
                    onChange={onSelectionChange}
                />
            </div>
        </div>
    );
}

/* One row of the table view, matching the design's columns. */
export function FileTableRow({
    media,
    keyid,
    selected,
    onSelectionChange,
}: {
    media: MediaListItem;
    keyid: string;
    selected: boolean;
    onSelectionChange: () => void;
}) {
    const kind = kindLabels[media.kind];
    const isPublic = media.access !== "private";

    return (
        <tr className={selected ? "is-selected" : undefined}>
            <td className="file-table-check">
                <Checkbox
                    checked={selected}
                    label={
                        <span className="visually-hidden">
                            Select {media.originalFileName}
                        </span>
                    }
                    onChange={onSelectionChange}
                />
            </td>
            <td>
                <FileDetailsDialog media={media} keyid={keyid}>
                    <button type="button" className="file-table-name">
                        <span
                            className="file-table-tile"
                            data-kind={kind.toLowerCase()}
                        >
                            <FileTypeIcon mimeType={media.mimeType} />
                        </span>
                        <span className="ell">{media.originalFileName}</span>
                    </button>
                </FileDetailsDialog>
            </td>
            <td className="muted">{kind}</td>
            <td className="file-table-size">{formatFileSize(media.size)}</td>
            <td className="muted">{formatRelativeUpload(media.createdAt)}</td>
            <td>
                <span className="file-table-access">
                    {isPublic ? (
                        <Globe aria-hidden="true" />
                    ) : (
                        <LockKeyhole aria-hidden="true" />
                    )}
                    {isPublic ? "Public" : "Private"}
                </span>
            </td>
        </tr>
    );
}
