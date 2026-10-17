import { uploadFile, type UploadProgress } from "@medialit/uploader";

export type UploadStatus = {
    /** 1-based position of the file being uploaded. */
    index: number;
    total: number;
    progress: UploadProgress | null;
};

/* "Uploading 2 of 3 · 42%" while an upload runs. */
export function uploadLabel(status: UploadStatus | null) {
    if (!status?.progress) return "Uploading…";
    const percent = Math.round(status.progress.percentage);
    return status.total > 1
        ? `Uploading ${status.index} of ${status.total} · ${percent}%`
        : `Uploading · ${percent}%`;
}

/* Uploads each file with MediaLit's resumable (tus) uploader, then seals it.
   Sealing makes the upload permanent; until then it stays temporary. The API
   signs and seals for the signed-in user, so the app's key never leaves it. */
export async function uploadFilesToApp(
    appId: string,
    files: File[],
    onStatus?: (status: UploadStatus) => void,
) {
    const appPath = `/api/apps/${encodeURIComponent(appId)}/media`;
    let uploaded = 0;

    for (let position = 0; position < files.length; position++) {
        const file = files[position];
        try {
            const media = await uploadFile(file, {
                signatureEndpoint: `${appPath}/signature`,
                onProgress: (progress) =>
                    onStatus?.({
                        index: position + 1,
                        total: files.length,
                        progress,
                    }),
            });

            const response = await fetch(
                `${appPath}/${encodeURIComponent(media.mediaId)}/seal`,
                { method: "POST" },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    data.error || `Could not finish uploading ${file.name}`,
                );
            }
            uploaded += 1;
        } catch (uploadError) {
            return {
                uploaded,
                error:
                    uploadError instanceof Error
                        ? uploadError.message
                        : `Could not upload ${file.name}`,
            };
        }
    }

    return { uploaded, error: "" };
}
