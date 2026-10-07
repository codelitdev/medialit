import { useRef, useState, type DragEvent } from "react";
import {
    useMediaLitUpload,
    type UseMediaLitUploadOptions,
} from "./use-medialit-upload";
import { formatBytes, matchesAccept } from "./files";

export interface MediaLitUploaderLabels {
    prompt: string;
    /** Shown under the prompt. Defaults to the accepted types and size limit. */
    hint?: string;
    cancel: string;
    uploaded: string;
    uploadAnother: string;
    retry: string;
    chooseAnother: string;
    invalidType: string;
    tooLarge: (maxSize: string) => string;
}

const defaultLabels: MediaLitUploaderLabels = {
    prompt: "Drop a file here or click to browse",
    cancel: "Cancel",
    uploaded: "Uploaded",
    uploadAnother: "Upload another",
    retry: "Try again",
    chooseAnother: "Choose another file",
    invalidType: "This file type is not allowed",
    tooLarge: (maxSize) => `Files must be ${maxSize} or smaller`,
};

export interface MediaLitUploaderProps extends UseMediaLitUploadOptions {
    /** Same format as the `accept` attribute of `<input type="file">`. */
    accept?: string;
    /** Bytes. MediaLit enforces its own limit as well. */
    maxFileSize?: number;
    disabled?: boolean;
    className?: string;
    labels?: Partial<MediaLitUploaderLabels>;
}

export function MediaLitUploader({
    accept,
    maxFileSize,
    disabled = false,
    className,
    labels: labelOverrides,
    ...uploadOptions
}: MediaLitUploaderProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { status, progress, file, media, error, upload, cancel, reset } =
        useMediaLitUpload(uploadOptions);
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [invalid, setInvalid] = useState("");

    const hint =
        labels.hint ??
        [accept, maxFileSize ? `Up to ${formatBytes(maxFileSize)}` : ""]
            .filter(Boolean)
            .join(" · ");

    const start = (selected: File | undefined) => {
        if (!selected || disabled) return;
        if (!matchesAccept(selected, accept)) {
            return setInvalid(labels.invalidType);
        }
        if (maxFileSize && selected.size > maxFileSize) {
            return setInvalid(labels.tooLarge(formatBytes(maxFileSize)));
        }
        setInvalid("");
        upload(selected);
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        start(e.dataTransfer.files[0]);
    };

    const chooseFile = () => {
        reset();
        inputRef.current?.click();
    };

    const percent = Math.round(progress);

    return (
        <div
            className={["medialit-uploader", className]
                .filter(Boolean)
                .join(" ")}
            data-status={status}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                hidden
                disabled={disabled}
                onChange={(e) => {
                    start(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />

            {status === "idle" && (
                <>
                    <button
                        type="button"
                        className="medialit-uploader__dropzone"
                        data-dragging={dragging || undefined}
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            if (!disabled) setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                    >
                        <UploadIcon />
                        <span className="medialit-uploader__prompt">
                            {labels.prompt}
                        </span>
                        {hint && (
                            <span className="medialit-uploader__hint">
                                {hint}
                            </span>
                        )}
                    </button>
                    {invalid && (
                        <p className="medialit-uploader__error" role="alert">
                            {invalid}
                        </p>
                    )}
                </>
            )}

            {status === "uploading" && file && (
                <div className="medialit-uploader__panel">
                    <div className="medialit-uploader__row">
                        <span className="medialit-uploader__name">
                            {file.name}
                        </span>
                        <span className="medialit-uploader__percent">
                            {percent}%
                        </span>
                    </div>
                    <div
                        className="medialit-uploader__bar"
                        role="progressbar"
                        aria-label={file.name}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                    >
                        <div
                            className="medialit-uploader__fill"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="medialit-uploader__actions">
                        <button
                            type="button"
                            className="medialit-uploader__button"
                            onClick={cancel}
                        >
                            {labels.cancel}
                        </button>
                    </div>
                </div>
            )}

            {status === "success" && media && (
                <div className="medialit-uploader__panel">
                    <div className="medialit-uploader__row">
                        {media.thumbnail ? (
                            <img
                                className="medialit-uploader__thumbnail"
                                src={media.thumbnail}
                                alt=""
                            />
                        ) : (
                            <CheckIcon />
                        )}
                        <div className="medialit-uploader__details">
                            <span className="medialit-uploader__name">
                                {media.originalFileName}
                            </span>
                            <span className="medialit-uploader__hint">
                                {labels.uploaded} · {formatBytes(media.size)}
                            </span>
                        </div>
                    </div>
                    <div className="medialit-uploader__actions">
                        <button
                            type="button"
                            className="medialit-uploader__button"
                            onClick={chooseFile}
                            disabled={disabled}
                        >
                            {labels.uploadAnother}
                        </button>
                    </div>
                </div>
            )}

            {status === "error" && file && (
                <div className="medialit-uploader__panel">
                    <div className="medialit-uploader__row">
                        <AlertIcon />
                        <div className="medialit-uploader__details">
                            <span className="medialit-uploader__name">
                                {file.name}
                            </span>
                            <span
                                className="medialit-uploader__error"
                                role="alert"
                            >
                                {error?.message}
                            </span>
                        </div>
                    </div>
                    <div className="medialit-uploader__actions">
                        <button
                            type="button"
                            className="medialit-uploader__button medialit-uploader__button--primary"
                            onClick={() => upload(file)}
                            disabled={disabled}
                        >
                            {labels.retry}
                        </button>
                        <button
                            type="button"
                            className="medialit-uploader__button"
                            onClick={chooseFile}
                            disabled={disabled}
                        >
                            {labels.chooseAnother}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const iconProps = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

function UploadIcon() {
    return (
        <svg {...iconProps} className="medialit-uploader__icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            {...iconProps}
            className="medialit-uploader__icon medialit-uploader__icon--success"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l3 3 5-6" />
        </svg>
    );
}

function AlertIcon() {
    return (
        <svg
            {...iconProps}
            className="medialit-uploader__icon medialit-uploader__icon--error"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
        </svg>
    );
}
