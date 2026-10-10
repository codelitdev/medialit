"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";

export default function UploadButton({ keyid }: { keyid: string }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length) return;

        setBusy(true);
        setError("");
        setMessage("");
        let uploaded = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetch(
                    `/app/${encodeURIComponent(keyid)}/files/upload`,
                    { method: "POST", body: formData },
                );
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(
                        data.error || `Could not upload ${file.name}`,
                    );
                }
                uploaded += 1;
            } catch (uploadError) {
                setError(
                    uploadError instanceof Error
                        ? uploadError.message
                        : `Could not upload ${file.name}`,
                );
                break;
            }
        }

        setBusy(false);
        if (uploaded) {
            setMessage(
                uploaded === 1
                    ? "File uploaded."
                    : `${uploaded} files uploaded.`,
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
                {busy ? "Uploading…" : "Upload"}
            </button>
            {message ? (
                <span className="inline-feedback" role="status">
                    {message}
                </span>
            ) : null}
            {error ? (
                <span className="inline-error" role="alert">
                    {error}
                </span>
            ) : null}
        </div>
    );
}
