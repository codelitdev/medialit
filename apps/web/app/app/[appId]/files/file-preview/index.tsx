"use client";

import { MediaLitVideo, type PlayableMedia } from "@medialit/react";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
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
    Maximize2,
    Minimize2,
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
import { useFileUrl, type FileMedia } from "./use-file-url";
import { nativeViewerFor, type NativeViewer } from "./viewers";

/* Matches the dialog's phone layout in globals.css. */
const MOBILE_QUERY = "(max-width: 759px)";

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
    loadError,
    playable,
}: {
    media: MediaListItem;
    loadError: boolean;
    playable?: PlayableMedia;
}) {
    const fileUrl = playable?.file;
    if (!playable && !loadError) {
        return (
            <span className="file-dialog-loading" role="status">
                <Loader product="medialit" size={96} />
                <span className="visually-hidden">Loading preview</span>
            </span>
        );
    }

    if (playable && fileUrl) {
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
            // HLS or the web MP4 when the app makes them, else the original.
            return (
                <MediaLitVideo className="file-dialog-media" media={playable} />
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
type StreamingFormat = "HLS" | "MP4";

/* The streaming version made for a video, the one the player picks: HLS,
   else the web MP4. Null when the app's Video streaming setting made none. */
function videoStreaming(
    derivatives: FileMedia["derivatives"],
): { format: StreamingFormat; status: string; error?: string } | null {
    const hls = derivatives?.hls;
    if (hls) return { format: "HLS", status: hls.status, error: hls.error };
    const mp4 = derivatives?.mp4;
    if (mp4) return { format: "MP4", status: mp4.status, error: mp4.error };
    return null;
}

const streamingStatus: Record<string, string> = {
    queued: "processing",
    processing: "processing",
    ready: "ready",
    failed: "failed",
};

/* Whether the video plays as HLS, the web MP4 or the original, and why. */
function StreamingFact({
    appId,
    playable,
}: {
    appId: string;
    playable?: FileMedia;
}) {
    if (!playable) return null;
    const streaming = videoStreaming(playable.derivatives);
    return (
        <div className="file-dialog-fact-stacked">
            <dt>Streaming</dt>
            {streaming ? (
                <dd>
                    {streaming.format} ·{" "}
                    {streamingStatus[streaming.status] ?? streaming.status}
                    {streaming.status === "failed" && (
                        <span className="file-dialog-fact-note">
                            {streaming.error ? `${streaming.error}. ` : ""}
                            The original plays instead.
                        </span>
                    )}
                    {streaming.status !== "ready" &&
                        streaming.status !== "failed" && (
                            <span className="file-dialog-fact-note">
                                The original plays until it is ready.
                            </span>
                        )}
                </dd>
            ) : (
                <dd>
                    Off for this video
                    <span className="file-dialog-fact-note">
                        It plays the original. Choose HLS or MP4 in{" "}
                        <Link href={`/app/${appId}/settings#media`}>
                            App settings
                        </Link>
                        ; videos uploaded after that get it.
                    </span>
                </dd>
            )}
        </div>
    );
}

/* The language's name in the viewer's language, else its code. */
function languageName(code?: string): string | undefined {
    if (!code) return undefined;
    try {
        return (
            new Intl.DisplayNames(undefined, { type: "language" }).of(code) ??
            code
        );
    } catch {
        return code;
    }
}

/* Captions and transcripts, when the app made them for this file. */
function CaptionsFact({ playable }: { playable?: FileMedia }) {
    const captions = playable?.derivatives?.captions;
    if (!captions) return null;
    const files = captions.files;
    return (
        <div className="file-dialog-fact-stacked">
            <dt>Captions</dt>
            <dd>
                {captions.status === "ready"
                    ? (languageName(captions.language) ?? "Ready")
                    : (streamingStatus[captions.status] ?? captions.status)}
                {captions.status === "ready" && files && (
                    <span className="file-dialog-fact-note">
                        <a href={files.vtt} target="_blank" rel="noreferrer">
                            WebVTT
                        </a>
                        {" · "}
                        <a href={files.text} target="_blank" rel="noreferrer">
                            Transcript
                        </a>
                        {" · "}
                        <a href={files.json} target="_blank" rel="noreferrer">
                            JSON
                        </a>
                    </span>
                )}
                {captions.status === "failed" && captions.error && (
                    <span className="file-dialog-fact-note">
                        {captions.error}
                    </span>
                )}
                {(captions.status === "queued" ||
                    captions.status === "processing") && (
                    <span className="file-dialog-fact-note">
                        The file plays now; captions are added when ready.
                    </span>
                )}
            </dd>
        </div>
    );
}

function FileDetailsContent({
    media,
    appId,
    viewer,
    expanded,
    onExpandedChange,
}: {
    media: MediaListItem;
    appId: string;
    viewer: NativeViewer | null;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
}) {
    const { media: playable, error } = useFileUrl(appId, media.mediaId);
    const url = playable?.file ?? "";
    const kind = kindLabels[media.kind];
    const playing =
        media.kind === "video" && playable?.derivatives?.hls?.status === "ready"
            ? "HLS"
            : media.kind === "video" &&
                playable?.derivatives?.mp4?.status === "ready"
              ? "MP4"
              : undefined;
    const fileLabel =
        playing ??
        (media.originalFileName.split(".").at(-1)?.toUpperCase() || kind);
    const isPublic = media.access !== "private";
    const ExpandIcon = expanded ? Minimize2 : Maximize2;
    const expandLabel = expanded ? "Show file details" : "Expand preview";

    return (
        <>
            <div className="file-dialog-header">
                <DialogTitle className="file-dialog-title">
                    {expanded ? media.originalFileName : "File details"}
                </DialogTitle>
                <button
                    type="button"
                    className="file-dialog-icon-button"
                    onClick={() => onExpandedChange(!expanded)}
                    aria-label={expandLabel}
                    title={expandLabel}
                >
                    <ExpandIcon aria-hidden="true" />
                </button>
            </div>
            <div className="file-dialog-preview">
                {viewer ? (
                    <viewer.Component media={media} appId={appId} />
                ) : (
                    <>
                        <FilePreviewMedia
                            media={media}
                            loadError={error}
                            playable={playable}
                        />
                        <span className="file-preview-caption">
                            {fileLabel}
                        </span>
                    </>
                )}
            </div>
            <div className="file-dialog-body" hidden={expanded}>
                <div>
                    <h3 className="file-dialog-name">
                        {media.originalFileName}
                    </h3>
                    <div className="file-dialog-badges">
                        <span className="file-badge">
                            {viewer?.label ?? kind}
                        </span>
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
                    {media.group && (
                        <div>
                            <dt>Group</dt>
                            <dd className="mono">{media.group}</dd>
                        </div>
                    )}
                    <div>
                        <dt>File ID</dt>
                        <dd className="mono">{media.mediaId}</dd>
                    </div>
                    {media.kind === "video" && (
                        <StreamingFact appId={appId} playable={playable} />
                    )}
                    <CaptionsFact playable={playable} />
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

/* The details dialog shared by grid cards and table rows. On phones it fills
   the screen, and files with a native viewer open straight into reading. */
function FileDetailsDialog({
    media,
    appId,
    children,
}: {
    media: MediaListItem;
    appId: string;
    children: ReactNode;
}) {
    const viewer = nativeViewerFor(media);
    const [expanded, setExpanded] = useState(false);

    const onOpenChange = (open: boolean) => {
        if (!open) return;
        setExpanded(
            Boolean(viewer?.fullScreenOnMobile) &&
                window.matchMedia(MOBILE_QUERY).matches,
        );
    };

    return (
        <Dialog onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent
                className="file-dialog sm:max-w-[960px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0"
                closeClassName="file-dialog-close"
                data-expanded={expanded ? "" : undefined}
                aria-describedby={undefined}
            >
                <FileDetailsContent
                    media={media}
                    appId={appId}
                    viewer={viewer}
                    expanded={expanded}
                    onExpandedChange={setExpanded}
                />
            </DialogContent>
        </Dialog>
    );
}

export default function FilePreview({
    media,
    appId,
    layout = "grid",
    selected,
    onSelectionChange,
}: {
    media: MediaListItem;
    appId: string;
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
            <FileDetailsDialog media={media} appId={appId}>
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
    appId,
    selected,
    onSelectionChange,
}: {
    media: MediaListItem;
    appId: string;
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
                <FileDetailsDialog media={media} appId={appId}>
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
