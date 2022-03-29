export default function generateKey ({ userId, mediaId, extension }: {
    userId: string,
    mediaId: string,
    extension: string
}): string {
    return `${userId}/${mediaId}/main.${extension}`;
}