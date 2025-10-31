"use client";

import { useState, useRef } from "react";
import { Upload } from "tus-js-client";

interface Media {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: string;
    file: string;
    group?: string;
    caption?: string;
    thumbnail: string;
}

export default function TusUploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedMedia, setUploadedMedia] = useState<Media | null>(null);
    const [error, setError] = useState<string>("");
    const [caption, setCaption] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState("");
    const uploadRef = useRef<Upload>(null);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError("");
        setUploadProgress(0);
        setUploadSpeed("");

        try {
            // Get presigned URL
            const presignedUrlResponse = await fetch("/api/medialit", {
                method: "POST",
            });
            const { endpoint, signature, error } =
                await presignedUrlResponse.json();

            if (error || !signature) {
                throw new Error(error || "Failed to get signature");
            }

            // Use the endpoint directly since we're sending signature in headers
            const uploadUrl = `${endpoint}/media/create/resumable`;

            // Prepare metadata for tus (tus-js-client will encode values as base64)
            const metadata = {
                fileName: file.name,
                mimeType: file.type,
                access: isPublic ? "public" : "private",
                caption: caption || "",
            };

            // Create tus upload
            const upload = new Upload(file, {
                endpoint: uploadUrl,
                chunkSize: 1024000,
                retryDelays: [0, 3000, 5000],
                headers: {
                    "x-medialit-signature": signature,
                },
                metadata,
                onError: (error) => {
                    console.error("Tus upload error:", error);
                    setError(
                        error instanceof Error
                            ? error.message
                            : "Upload failed",
                    );
                    setUploading(false);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = (bytesUploaded / bytesTotal) * 100;
                    setUploadProgress(percentage);
                },
                onSuccess: async () => {
                    console.log("Upload finished!");
                    setUploading(false);
                    setUploadProgress(100);

                    // Show success message - user can see the uploaded file in the media list below
                    setUploadedMedia({
                        mediaId: "uploaded",
                        originalFileName: file.name,
                        mimeType: file.type,
                        size: file.size,
                        access: isPublic ? "public" : "private",
                        file: "",
                        caption: caption || "",
                        thumbnail: "",
                    });

                    // Reset form after 3 seconds
                    setTimeout(() => {
                        setFile(null);
                        setCaption("");
                        setUploadedMedia(null);
                    }, 3000);
                },
            });

            uploadRef.current = upload;
            upload.start();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "An error occurred during upload",
            );
            setUploading(false);
        }
    };

    const handleCancel = () => {
        if (uploadRef.current) {
            uploadRef.current.abort();
            uploadRef.current = null;
            setUploading(false);
            setUploadProgress(0);
        }
    };

    return (
        <div className="w-full">
            <form onSubmit={handleUpload} className="space-y-4">
                <div className="flex flex-col space-y-2">
                    <label htmlFor="tus-file" className="text-sm font-medium">
                        Select an image file (TUS Multipart Upload)
                    </label>
                    <input
                        type="file"
                        id="tus-file"
                        // accept="image/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="border rounded-md p-2"
                    />
                </div>

                <div className="flex flex-col space-y-2">
                    <label
                        htmlFor="tus-caption"
                        className="text-sm font-medium"
                    >
                        Caption
                    </label>
                    <input
                        type="text"
                        id="tus-caption"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="border rounded-md p-2"
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        id="tus-isPublic"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="rounded"
                    />
                    <label
                        htmlFor="tus-isPublic"
                        className="text-sm font-medium"
                    >
                        Make file public
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={!file || uploading}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {uploading ? "Uploading..." : "Upload with TUS"}
                </button>

                {uploading && (
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="ml-2 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                    >
                        Cancel
                    </button>
                )}
            </form>

            {uploading && (
                <div className="mt-4 space-y-2">
                    <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                    <p className="text-sm text-gray-600">
                        {uploadProgress.toFixed(1)}% uploaded
                    </p>
                    {uploadSpeed && (
                        <p className="text-sm text-gray-600">{uploadSpeed}</p>
                    )}
                </div>
            )}

            {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md">
                    {error}
                </div>
            )}

            {uploadedMedia && (
                <div className="mt-6 p-4 border rounded-md space-y-4 bg-green-50 border-green-200">
                    <h3 className="text-lg font-semibold text-green-800">
                        ✅ Upload Complete!
                    </h3>

                    <div className="space-y-2 text-green-700">
                        <p>
                            <span className="font-medium">File name:</span>{" "}
                            {uploadedMedia.originalFileName}
                        </p>
                        <p>
                            <span className="font-medium">Size:</span>{" "}
                            {Math.round(uploadedMedia.size / 1024)} KB
                        </p>
                        <p>
                            <span className="font-medium">Type:</span>{" "}
                            {uploadedMedia.mimeType}
                        </p>
                        <p>
                            <span className="font-medium">Access:</span>{" "}
                            {uploadedMedia.access}
                        </p>
                        {uploadedMedia.caption && (
                            <p>
                                <span className="font-medium">Caption:</span>{" "}
                                {uploadedMedia.caption}
                            </p>
                        )}
                    </div>

                    <p className="text-sm text-green-600">
                        Your file has been uploaded successfully! Check the
                        media list below to see it with all details including
                        the thumbnail.
                    </p>
                </div>
            )}
        </div>
    );
}
