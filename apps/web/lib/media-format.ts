export function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    if (size < 1024 * 1024 * 1024)
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatAppStorage(size: number) {
    if (size === 0) return "0 KB";
    const megabytes = size / (1024 * 1024);
    if (megabytes >= 100) return `${megabytes.toFixed(1)} MB`;
    if (megabytes >= 1) return `${megabytes.toFixed(2)} MB`;
    return formatFileSize(size);
}

export function formatRelativeUpload(value: string | Date | null) {
    if (!value) return "No uploads yet";
    const uploadedAt = new Date(value);
    const now = new Date();
    const elapsed = Math.max(0, now.getTime() - uploadedAt.getTime());
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    const today = new Date(now);
    const uploadDay = new Date(uploadedAt);
    today.setHours(0, 0, 0, 0);
    uploadDay.setHours(0, 0, 0, 0);
    const days = Math.floor(
        (today.getTime() - uploadDay.getTime()) / 86_400_000,
    );
    if (days === 1) return "Yesterday";
    if (hours < 24) return `${hours} h ago`;
    if (days < 7) return `${days} days ago`;
    return uploadedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year:
            uploadedAt.getFullYear() === now.getFullYear()
                ? undefined
                : "numeric",
    });
}
