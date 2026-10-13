"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadFilesToApp, type UploadStatus } from "./upload-files";

function uploadLabel(status: UploadStatus | null) {
    if (!status?.progress) return "Uploading…";
    const percent = Math.round(status.progress.percentage);
    return status.total > 1
        ? `Uploading ${status.index} of ${status.total} · ${percent}%`
        : `Uploading · ${percent}%`;
}

export default function UploadButton({ keyid }: { keyid: string }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<UploadStatus | null>(null);
    const [error, setError] = useState("");

    async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length) return;

        setBusy(true);
        setError("");
        setStatus(null);
        const { uploaded, error: uploadError } = await uploadFilesToApp(
            keyid,
            files,
            setStatus,
        );
        setStatus(null);
        if (uploadError) setError(uploadError);

        setBusy(false);
        if (uploaded) {
            toast.success(
                uploaded === 1 ? "File uploaded" : `${uploaded} files uploaded`,
            );
            router.refresh();
        }
    }

    return (
        <div className="upload-control">
            <input
                ref={inputRef}
                type="file"
                multiple
                className="visually-hidden"
                aria-label="Choose files to upload"
                onChange={uploadFiles}
            />
            <button
                type="button"
                className="workspace-button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
            >
                {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
                {busy ? uploadLabel(status) : "Upload"}
            </button>
            {error ? (
                <span className="inline-error" role="alert">
                    {error}
                </span>
            ) : null}
        </div>
    );
}
