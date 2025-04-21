import MediaUploadForm from "@/components/MediaUploadForm";

export default function Home() {
    return (
        <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
            <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start w-full max-w-2xl">
                <div className="text-center sm:text-left w-full">
                    <h1 className="text-4xl font-bold mb-4">MediaLit Demo</h1>
                    <p className="text-gray-600 dark:text-gray-300 mb-8">
                        This demo shows how to use the MediaLit package to
                        handle media files. Upload an image to see:
                    </p>
                    <ul className="text-left list-disc list-inside space-y-2 mb-8">
                        <li>Direct upload using presigned URLs</li>
                        <li>Automatic thumbnail generation</li>
                        <li>Media information retrieval</li>
                        <li>File deletion</li>
                    </ul>
                </div>

                <MediaUploadForm />
            </main>
        </div>
    );
}
