"use client";

import { useState } from "react";
import Image from "next/image";

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

export default function MediaUploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedMedia, setUploadedMedia] = useState<Media | null>(null);
    const [error, setError] = useState<string>("");
    const [caption, setCaption] = useState("");
    const [isPublic, setIsPublic] = useState(false);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError("");

        try {
            // Get presigned URL from our API route
            const presignedUrlResponse = await fetch("/api/medialit", {
                method: "POST",
            });
            const { presignedUrl, error } = await presignedUrlResponse.json();

            if (error || !presignedUrl) {
                throw new Error(error || "Failed to get presigned URL");
            }

            // Create FormData and append required fields
            const formData = new FormData();
            formData.append("file", file);
            formData.append("caption", caption);
            formData.append("access", isPublic ? "public" : "private");

            // Upload file using presigned URL
            const uploadResponse = await fetch(presignedUrl, {
                method: "POST",
                body: formData,
            });

            if (!uploadResponse.ok) {
                throw new Error("Failed to upload file");
            }

            const media = await uploadResponse.json();

            // Get media details after successful upload
            const mediaResponse = await fetch(
                `/api/medialit?mediaId=${media.mediaId}`,
            );
            const mediaData = await mediaResponse.json();

            if (mediaResponse.ok) {
                setUploadedMedia(mediaData);
            } else {
                throw new Error(
                    mediaData.error || "Failed to get media details",
                );
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "An error occurred during upload",
            );
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!uploadedMedia?.mediaId) return;

        try {
            const response = await fetch(
                `/api/medialit?mediaId=${uploadedMedia.mediaId}`,
                {
                    method: "DELETE",
                },
            );
            const data = await response.json();

            if (response.ok) {
                setUploadedMedia(null);
                setFile(null);
            } else {
                throw new Error(data.error || "Failed to delete file");
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to delete file",
            );
        }
    };

    return (
        <div className="w-full">
            <form onSubmit={handleUpload} className="space-y-4">
                <div className="flex flex-col space-y-2">
                    <label htmlFor="file" className="text-sm font-medium">
                        Select an image file
                    </label>
                    <input
                        type="file"
                        id="file"
                        accept="image/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="border rounded-md p-2"
                    />
                </div>

                <div className="flex flex-col space-y-2">
                    <label htmlFor="caption" className="text-sm font-medium">
                        Caption
                    </label>
                    <input
                        type="text"
                        id="caption"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="border rounded-md p-2"
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        id="isPublic"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="rounded"
                    />
                    <label htmlFor="isPublic" className="text-sm font-medium">
                        Make file public
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={!file || uploading}
                    className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {uploading ? "Uploading..." : "Upload"}
                </button>
            </form>

            {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md">
                    {error}
                </div>
            )}

            {uploadedMedia && (
                <div className="mt-6 p-4 border rounded-md space-y-4">
                    <h3 className="text-lg font-semibold">
                        Uploaded File Details
                    </h3>

                    {uploadedMedia.file && (
                        <div className="aspect-video relative overflow-hidden rounded-md">
                            <Image
                                src={uploadedMedia.file}
                                alt={uploadedMedia.originalFileName}
                                width={400}
                                height={300}
                                className="object-cover"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <p>
                            <span className="font-medium">Media ID:</span>{" "}
                            {uploadedMedia.mediaId}
                        </p>
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
                        <p>
                            <span className="font-medium">Caption:</span>{" "}
                            {uploadedMedia.caption}
                        </p>
                        <a
                            href={uploadedMedia.file}
                            className="text-blue-500 underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Direct link
                        </a>
                    </div>

                    <button
                        onClick={handleDelete}
                        className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                    >
                        Delete File
                    </button>
                </div>
            )}
        </div>
    );
}
