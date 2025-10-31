"use client";

import MediaUploadForm from "@/components/MediaUploadForm";
import TusUploadForm from "@/components/TusUploadForm";
import MediaList from "@/components/MediaList";
export default function Home() {
    return (
        <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
            <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start w-full max-w-4xl">
                <div className="text-center sm:text-left w-full">
                    <h1 className="text-4xl font-bold mb-4">MediaLit Demo</h1>
                    <p className="text-gray-600 dark:text-gray-300 mb-8">
                        This demo shows how to use the MediaLit package to
                        handle media files. Upload an image to see:
                    </p>
                    <ul className="text-left list-disc list-inside space-y-2 mb-8">
                        <li>
                            Regular upload and resumable upload using TUS
                            protocol
                        </li>
                        <li>Real-time upload progress tracking</li>
                        <li>Automatic thumbnail generation</li>
                        <li>Media information retrieval</li>
                        <li>File deletion</li>
                        <li>Media listing with pagination</li>
                    </ul>
                </div>

                {/* Upload Forms Grid */}
                <div className="w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-2xl font-bold mb-4">
                                Standard Upload
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300 mb-4">
                                Traditional single-request upload. Best for
                                smaller files.
                            </p>
                            <MediaUploadForm />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-4">
                                TUS Resumable Upload
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300 mb-4">
                                Multipart resumable uploads with progress
                                tracking. Ideal for larger files and unreliable
                                connections.
                            </p>
                            <TusUploadForm />
                        </div>
                    </div>
                </div>

                <div className="w-full mt-8">
                    <h2 className="text-2xl font-bold mb-4">Uploaded Media</h2>
                    <MediaList />
                </div>
            </main>
        </div>
    );
}
