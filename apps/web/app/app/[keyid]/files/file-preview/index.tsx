"use client";

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
    LockKeyhole,
} from "lucide-react";
import type { MediaListItem } from "@/lib/media";
import { formatFileSize, formatRelativeUpload } from "@/lib/media-format";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import FileInteractivity from "./file-interactivity";

function kindFor(mimeType: string) {
    if (mimeType.startsWith("image/")) return "Image";
    if (mimeType.startsWith("video/")) return "Video";
    if (mimeType.startsWith("audio/")) return "Audio";
    if (mimeType === "application/pdf") return "PDF";
    return "File";
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
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
    const kind = kindFor(media.mimeType);
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
            <Dialog>
                <DialogTrigger asChild>
                    <button
                        type="button"
                        className={`file-card${layout === "list" ? " file-row" : ""}`}
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
                </DialogTrigger>
                <DialogContent className="sm:max-w-[620px] gap-0 overflow-hidden p-0">
                    <div className="file-dialog-preview">
                        {media.thumbnail ? (
                            <Image
                                src={media.thumbnail}
                                alt={media.originalFileName}
                                fill
                                className="object-contain"
                                unoptimized
                            />
                        ) : (
                            <span className="file-type-icon">
                                <FileTypeIcon mimeType={media.mimeType} />
                            </span>
                        )}
                    </div>
                    <div className="file-dialog-body">
                        <DialogHeader>
                            <DialogTitle>{media.originalFileName}</DialogTitle>
                        </DialogHeader>
                        <p className="settings-subtle">
                            File details and sharing
                        </p>
                        <div className="file-detail-grid">
                            <div>
                                <Label>File type</Label>
                                <p>{media.mimeType}</p>
                            </div>
                            <div>
                                <Label>Size</Label>
                                <p>{formatFileSize(media.size)}</p>
                            </div>
                            <div>
                                <Label>Group</Label>
                                <p>{media.group || "—"}</p>
                            </div>
                            <div>
                                <Label>Access</Label>
                                <p>
                                    {media.access === "private"
                                        ? "Private"
                                        : "Public"}
                                </p>
                            </div>
                        </div>
                        <div className="file-access-row">
                            <Label>Public access</Label>
                            <Switch
                                checked={media.access !== "private"}
                                disabled
                                name="public"
                            />
                        </div>
                        <Separator className="my-4" />
                        <FileInteractivity media={media} keyid={keyid} />
                    </div>
                </DialogContent>
            </Dialog>
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
