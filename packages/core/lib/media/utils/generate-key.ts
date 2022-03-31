interface GenerateKeyProps {
    userId: string;
    mediaId: string;
    extension: string;
    type: "main" | "thumb";
}

export default function generateKey({
    userId,
    mediaId,
    extension,
    type,
}: GenerateKeyProps): string {
    return `${userId}/${mediaId}/${type}.${
        type === "thumb" ? "webp" : extension
    }`;
}
