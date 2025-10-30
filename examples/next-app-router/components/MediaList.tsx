"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
    FileImage,
    FileVideo,
    FileAudio,
    FileCode,
    FileArchive,
    File,
    X,
} from "lucide-react";

interface Media {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: "private" | "public";
    thumbnail?: string;
    group?: string;
    caption?: string;
    file?: string;
}

const FileTypeIcon = ({ mimeType }: { mimeType: string }) => {
    const [type] = mimeType.split("/");
    const iconSize = 48;

    switch (type) {
        case "image":
            return <FileImage size={iconSize} className="text-blue-500" />;
        case "video":
            return <FileVideo size={iconSize} className="text-purple-500" />;
        case "audio":
            return <FileAudio size={iconSize} className="text-green-500" />;
        case "text":
            return <FileCode size={iconSize} className="text-yellow-500" />;
        case "application":
            return <FileArchive size={iconSize} className="text-orange-500" />;
        default:
            return <File size={iconSize} className="text-gray-500" />;
    }
};

export default function MediaList() {
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
    const itemsPerPage = 10;

    useEffect(() => {
        const fetchMedia = async () => {
            try {
                setLoading(true);
                const response = await fetch(
                    `/api/medialit?page=${page}&limit=${itemsPerPage}`,
                );
                if (!response.ok) throw new Error("Failed to fetch media");
                const data = await response.json();
                setMedia(data);

                // Get total count for pagination
                const countResponse = await fetch("/api/medialit/count");
                if (countResponse.ok) {
                    const { count } = await countResponse.json();
                    setTotalPages(Math.ceil(count / itemsPerPage));
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load media",
                );
            } finally {
                setLoading(false);
            }
        };

        fetchMedia();
    }, [page]);

    const handleMediaClick = async (mediaId: string) => {
        try {
            const response = await fetch(`/api/medialit/${mediaId}`);
            if (!response.ok) throw new Error("Failed to fetch media details");
            const mediaDetails = await response.json();
            setSelectedMedia(mediaDetails);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load media details",
            );
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div className="text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {media.map((item) => (
                    <div
                        key={item.mediaId}
                        className="border rounded-lg p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleMediaClick(item.mediaId)}
                    >
                        <div className="aspect-square relative flex items-center justify-center bg-gray-100 rounded-lg">
                            {item.thumbnail ? (
                                <Image
                                    src={item.thumbnail}
                                    alt={item.originalFileName}
                                    fill
                                    className="object-cover rounded-lg"
                                />
                            ) : (
                                <FileTypeIcon mimeType={item.mimeType} />
                            )}
                        </div>
                        <div className="space-y-1">
                            <p
                                className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                                title={item.originalFileName}
                            >
                                {item.originalFileName}
                            </p>
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                                {Math.round(item.size / 1024)} KB
                            </p>
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                                {item.access}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 border rounded-md disabled:opacity-50 hover:bg-gray-50 text-gray-900 dark:text-gray-100"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-900 dark:text-gray-100">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page === totalPages}
                        className="px-4 py-2 border rounded-md disabled:opacity-50 hover:bg-gray-50 text-gray-900 dark:text-gray-100"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Modal */}
            {selectedMedia && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                    Media Details
                                </h2>
                                <button
                                    onClick={() => setSelectedMedia(null)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                                >
                                    <X className="w-6 h-6 text-gray-900 dark:text-gray-100" />
                                </button>
                            </div>

                            <div className="aspect-video relative flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                                {selectedMedia.thumbnail ? (
                                    selectedMedia.mimeType.startsWith(
                                        "video",
                                    ) ? (
                                        <video
                                            id="my-video"
                                            controls
                                            preload="auto"
                                            width="640"
                                            height="264"
                                            poster={selectedMedia.thumbnail}
                                            data-setup="{}"
                                        >
                                            <source
                                                src={selectedMedia.file}
                                                type="video/mp4"
                                            />
                                            <p className="vjs-no-js">
                                                To view this video please enable
                                                JavaScript, and consider
                                                upgrading to a web browser that
                                                <a
                                                    href="https://videojs.com/html5-video-support/"
                                                    target="_blank"
                                                >
                                                    supports HTML5 video
                                                </a>
                                            </p>
                                        </video>
                                    ) : (
                                        <Image
                                            src={selectedMedia.thumbnail}
                                            alt={selectedMedia.originalFileName}
                                            fill
                                            className="object-cover rounded-lg"
                                        />
                                    )
                                ) : (
                                    <FileTypeIcon
                                        mimeType={selectedMedia.mimeType}
                                    />
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            File name
                                        </p>
                                        <p className="font-medium mt-1 break-all text-gray-900 dark:text-gray-100">
                                            {selectedMedia.originalFileName}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Size
                                        </p>
                                        <p className="font-medium mt-1 text-gray-900 dark:text-gray-100">
                                            {(
                                                selectedMedia.size /
                                                1024 /
                                                1024
                                            ).toFixed(2)}{" "}
                                            MB
                                        </p>
                                    </div>
                                </div>

                                <hr className="border-gray-200 dark:border-gray-600" />

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            MIME Type
                                        </p>
                                        <p className="font-medium mt-1 text-gray-900 dark:text-gray-100">
                                            {selectedMedia.mimeType}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Access
                                        </p>
                                        <p className="font-medium mt-1 text-gray-900 dark:text-gray-100">
                                            {selectedMedia.access}
                                        </p>
                                    </div>
                                </div>

                                {selectedMedia.caption && (
                                    <>
                                        <hr className="border-gray-200 dark:border-gray-600" />
                                        <div>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                                Caption
                                            </p>
                                            <p className="font-medium mt-1 text-gray-900 dark:text-gray-100">
                                                {selectedMedia.caption}
                                            </p>
                                        </div>
                                    </>
                                )}

                                {selectedMedia.file && (
                                    <>
                                        <hr className="border-gray-200 dark:border-gray-600" />
                                        <div>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                                Direct Link
                                            </p>
                                            <a
                                                href={selectedMedia.file}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block font-medium mt-1 text-blue-600 dark:text-blue-400 hover:underline break-all"
                                            >
                                                {selectedMedia.file}
                                            </a>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
