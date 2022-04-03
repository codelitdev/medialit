import { CLOUD_PREFIX } from "../../config/constants";

interface GenerateKeyProps {
    mediaId: string;
    extension: string;
    type: "main" | "thumb";
}

export default function generateKey({
    mediaId,
    extension,
    type,
}: GenerateKeyProps): string {
    return `${CLOUD_PREFIX ? `${CLOUD_PREFIX}/` : ""}${mediaId}/${type}.${
        type === "thumb" ? "webp" : extension
    }`;
}
