"use client";

import { useState } from "react";
import Image from "next/image";
import { MediaLitUploader, type UploadedMedia } from "@medialit/react";
import "@medialit/react/styles.css";

export default function TusUploadForm() {
    const [caption, setCaption] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(
        null,
    );
    const [error, setError] = useState("");
    const [sealing, setSealing] = useState(false);
    const [isSealed, setIsSealed] = useState(false);

    // Uploads stay temporary until your backend seals them.
    const handleSeal = async () => {
        if (!uploadedMedia) return;

        setSealing(true);
        setError("");
        try {
            const response = await fetch(
                `/api/medialit?mediaId=${uploadedMedia.mediaId}`,
                {
                    method: "PATCH",
                },
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to seal file");
            }

            setUploadedMedia(data);
            setIsSealed(true);
            window.dispatchEvent(new Event("medialit:refresh"));
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to seal file",
            );
        } finally {
            setSealing(false);
        }
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-col space-y-2">
                <label htmlFor="tus-caption" className="text-sm font-medium">
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
                <label htmlFor="tus-isPublic" className="text-sm font-medium">
                    Make file public
                </label>
            </div>

            <MediaLitUploader
                signatureEndpoint="/api/medialit"
                access={isPublic ? "public" : "private"}
                caption={caption}
                chunkSize={1024000}
                onUploadComplete={(media) => {
                    setUploadedMedia(media);
                    setIsSealed(false);
                    setError("");
                }}
            />

            {error && (
                <div className="p-4 bg-red-50 text-red-500 rounded-md">
                    {error}
                </div>
            )}

            {uploadedMedia && (
                <div className="mt-6 p-4 border rounded-md space-y-4">
                    <h3 className="text-lg font-semibold">
                        Uploaded File Details
                    </h3>

                    {uploadedMedia.mimeType.startsWith("image/") && (
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

                    {!isSealed && (
                        <button
                            onClick={handleSeal}
                            disabled={sealing}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {sealing ? "Sealing..." : "Seal File"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
